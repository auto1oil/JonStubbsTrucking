'use client';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase-browser';
import {
  LOAD_STAMPS, MAX_LOADS, totalLoadTons, countLoads,
  type WorkOrderLoad, type LoadStampKey,
} from '@/lib/work-orders';
import { stampVerdict, fmtDistance, EXPECTED_LABEL, type OrderPins } from '@/lib/location-check';
import ScanButton from '@/components/ScanButton';

// The twenty-eight load lines off the paper haul ticket: per load, a ticket
// number, the four in/out stamps, what it weighed, and what it carried.
//
// A stamp is one tap. The time is taken from the phone the instant the button
// is pressed and shown straight away — the GPS fix is chased afterwards with a
// short timeout and attached if it arrives. That ordering matters in the field:
// a driver in a pit with no sky should still get an accurate time, and waiting
// on a fix before showing anything makes the button feel broken.
//
// The paper form is a ruled grid, which is unusable on a phone, so each load
// is a card instead. Same information, one thumb.

type Props = {
  workOrderId: string;
  locked?: boolean;
  // The ticket's material — what a load carried unless its own line says
  // otherwise, exactly like the ditto marks down the paper's MATERIAL column.
  defaultMaterial?: string;
  onTotalsChange?: (totals: { loads: number; tons: number }) => void;
  // The rows as shown (server rows plus anything queued), for a parent that
  // derives the day's start and end from the stamps.
  onLoadsChange?: (loads: WorkOrderLoad[]) => void;
};

const GPS_TIMEOUT_MS = 8000;

type Fix = { lat: number; lng: number; accuracy: number } | null;

// Best-effort location. Never rejects: a refused permission, a device with no
// GPS, or a slow fix all resolve to null so the stamp still saves.
function getFix(): Promise<Fix> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    let settled = false;
    const done = (v: Fix) => { if (!settled) { settled = true; resolve(v); } };
    const timer = setTimeout(() => done(null), GPS_TIMEOUT_MS);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        done({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      () => { clearTimeout(timer); done(null); },
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 30_000 },
    );
  });
}

const clockOf = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

// Where the floating stamp button sits, remembered per device. It's a
// per-driver convenience — a lost value just puts the button back in the
// corner.
const FAB_POS_KEY = 'jst-stamp-fab-pos';

// A stamp the phone couldn't send: kept here with its time and fix until the
// signal comes back, then sent in order. A tap in a pit with no bars must
// never be lost or feel broken.
type QueuedStamp = { loadNo: number; key: LoadStampKey; at: string; lat: number | null; lng: number | null; accuracy: number | null };
const queueKey = (workOrderId: string) => `jst-stamp-queue:${workOrderId}`;

// Whether a failed write looks like no signal rather than a refusal.
function looksOffline(message: string): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return /fetch|network|load failed|timed? ?out|connection/i.test(message);
}

export default function LoadLines({ workOrderId, locked = false, defaultMaterial = '', onTotalsChange, onLoadsChange }: Props) {
  const supabase = createClient();
  const [loads, setLoads] = useState<WorkOrderLoad[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // Times shown before the row comes back from the database, so a tap reads as
  // instant even on a bad signal. Keyed "loadNo:stampKey".
  const [pending, setPending] = useState<Record<string, string>>({});
  // Stamps waiting for signal, keyed the same way. Mirrored to localStorage
  // so closing the app in the pit doesn't lose them.
  const [queued, setQueued] = useState<Record<string, QueuedStamp>>({});
  // The order's pit and job pins, so a stamp can say where it landed.
  const [pins, setPins] = useState<OrderPins | null>(null);

  // Tell the funding app the ticket moved. Coalesced so a run of taps sends
  // once; fire-and-forget, and the server decides whether this hauler's
  // Auto 1 Funding link is active before anything leaves.
  const pingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function pingProgress() {
    if (pingTimer.current) clearTimeout(pingTimer.current);
    pingTimer.current = setTimeout(() => {
      fetch(`/api/work-orders/${workOrderId}/progress`, { method: 'POST', keepalive: true }).catch(() => null);
    }, 4000);
  }

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('work_order_loads')
      .select('*')
      .eq('work_order_id', workOrderId)
      .order('load_no');
    if (data) setLoads(data as WorkOrderLoad[]);
    setLoading(false);
  }, [supabase, workOrderId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    fetch(`/api/work-orders/${workOrderId}/pins`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (j.ok) setPins(j.pins ?? null); })
      .catch(() => null);
  }, [workOrderId]);

  // ---- The offline queue ----------------------------------------------------
  const persistQueue = (q: Record<string, QueuedStamp>) => {
    try {
      if (Object.keys(q).length) localStorage.setItem(queueKey(workOrderId), JSON.stringify(q));
      else localStorage.removeItem(queueKey(workOrderId));
    } catch { /* storage unavailable — the in-memory queue still works */ }
  };
  useEffect(() => {
    try {
      const raw = localStorage.getItem(queueKey(workOrderId));
      if (raw) setQueued(JSON.parse(raw) as Record<string, QueuedStamp>);
    } catch { /* nothing queued */ }
  }, [workOrderId]);

  // One row per load, written by (ticket, load #) so an insert and an update
  // are the same call and two taps can't make two rows.
  const writeLoad = (loadNo: number, patch: Record<string, unknown>) =>
    supabase.from('work_order_loads')
      .upsert({ work_order_id: workOrderId, load_no: loadNo, ...patch }, { onConflict: 'work_order_id,load_no' });

  const stampPatch = (q: QueuedStamp) => ({
    [`${q.key}_at`]: q.at,
    [`${q.key}_lat`]: q.lat,
    [`${q.key}_lng`]: q.lng,
    [`${q.key}_accuracy`]: q.accuracy,
  });

  const flushing = useRef(false);
  const flushQueue = useCallback(async () => {
    if (flushing.current || locked) return;
    const items = Object.values(queued).sort((a, b) => a.at.localeCompare(b.at));
    if (items.length === 0) return;
    flushing.current = true;
    let sent = 0;
    try {
      for (const q of items) {
        const { error: err } = await writeLoad(q.loadNo, stampPatch(q));
        if (err) break;
        sent += 1;
        setQueued((cur) => { const n = { ...cur }; delete n[`${q.loadNo}:${q.key}`]; persistQueue(n); return n; });
      }
    } finally {
      flushing.current = false;
    }
    if (sent > 0) { setError(''); refresh(); pingProgress(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, locked, workOrderId]);

  useEffect(() => {
    flushQueue();
    const onOnline = () => flushQueue();
    window.addEventListener('online', onOnline);
    const timer = setInterval(flushQueue, 20_000);
    return () => { window.removeEventListener('online', onOnline); clearInterval(timer); };
  }, [flushQueue]);

  // What the cards show: the server's rows with any queued stamps laid on
  // top, so a queued load counts, the next-stamp button moves on, and the
  // totals match what will land.
  const view = useMemo<WorkOrderLoad[]>(() => {
    const byNo = new Map<number, WorkOrderLoad>(loads.map((l) => [l.load_no, { ...l }]));
    for (const q of Object.values(queued)) {
      const row = byNo.get(q.loadNo) ?? ({
        id: `queued-${q.loadNo}`, work_order_id: workOrderId, load_no: q.loadNo, ticket_number: null, tons: null, material: null,
        load_in_at: null, load_in_lat: null, load_in_lng: null, load_in_accuracy: null,
        load_out_at: null, load_out_lat: null, load_out_lng: null, load_out_accuracy: null,
        unload_in_at: null, unload_in_lat: null, unload_in_lng: null, unload_in_accuracy: null,
        unload_out_at: null, unload_out_lat: null, unload_out_lng: null, unload_out_accuracy: null,
        created_at: q.at, updated_at: q.at,
      } as WorkOrderLoad);
      Object.assign(row, stampPatch(q));
      byNo.set(q.loadNo, row);
    }
    return [...byNo.values()].sort((a, b) => a.load_no - b.load_no);
  }, [loads, queued, workOrderId]);

  useEffect(() => {
    onTotalsChange?.({ loads: countLoads(view), tons: totalLoadTons(view) });
    onLoadsChange?.(view);
  }, [view, onTotalsChange, onLoadsChange]);

  async function stamp(loadNo: number, key: LoadStampKey) {
    if (locked) return;
    const at = new Date().toISOString();
    const pk = `${loadNo}:${key}`;
    setPending((p) => ({ ...p, [pk]: at }));
    setBusy(pk); setError('');

    const fix = await getFix();
    const q: QueuedStamp = { loadNo, key, at, lat: fix?.lat ?? null, lng: fix?.lng ?? null, accuracy: fix?.accuracy ?? null };

    // Anything already waiting goes first, so the order of the day holds.
    if (Object.keys(queued).length > 0) await flushQueue();

    const { error: err } = await writeLoad(loadNo, stampPatch(q));

    setBusy('');
    setPending((p) => { const n = { ...p }; delete n[pk]; return n; });
    if (err) {
      if (looksOffline(err.message)) {
        // Keep it on the phone; it goes when the signal does.
        setQueued((cur) => { const n = { ...cur, [pk]: q }; persistQueue(n); return n; });
        return;
      }
      setError(err.message); return;
    }
    refresh();
    pingProgress();
  }

  async function clearStamp(load: WorkOrderLoad, key: LoadStampKey) {
    if (locked) return;
    const pk = `${load.load_no}:${key}`;
    // A stamp that never left the phone is simply forgotten.
    if (queued[pk]) {
      setQueued((cur) => { const n = { ...cur }; delete n[pk]; persistQueue(n); return n; });
      return;
    }
    setBusy(pk); setError('');
    const { error: err } = await writeLoad(load.load_no, {
      [`${key}_at`]: null,
      [`${key}_lat`]: null,
      [`${key}_lng`]: null,
      [`${key}_accuracy`]: null,
    });
    setBusy('');
    if (err) { setError(err.message); return; }
    refresh();
    pingProgress();
  }

  // A BOL photo, read into the ticket # and tons when those boxes are blank.
  async function applyBol(loadNo: number, f: Record<string, unknown>, filePath: string | null) {
    const cur = view.find((l) => l.load_no === loadNo);
    const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
    const patch: Record<string, unknown> = {};
    if (filePath) patch.bol_path = filePath;
    if (!cur?.ticket_number && s(f.ticket_number)) patch.ticket_number = s(f.ticket_number);
    if ((cur?.tons == null) && typeof f.tons === 'number' && f.tons > 0) patch.tons = Math.round(f.tons * 100) / 100;
    if (!cur?.material && s(f.material)) patch.material = s(f.material);
    if (Object.keys(patch).length === 0) return;
    setLoads((ls) => ls.map((l) => (l.load_no === loadNo ? { ...l, ...patch } as WorkOrderLoad : l)));
    const { error: err } = await writeLoad(loadNo, patch);
    if (err) { setError(looksOffline(err.message) ? 'No signal — the BOL didn\'t save. Try again when you have bars.' : err.message); return; }
    refresh();
    pingProgress();
  }

  async function setField(loadNo: number, field: 'ticket_number' | 'tons' | 'material' | 'bol_path', value: string) {
    const val = value === '' ? null : (field === 'tons' ? Number(value) : value);
    // Keep the field responsive while the write is in flight.
    setLoads((ls) => ls.map((l) => (l.load_no === loadNo ? { ...l, [field]: val } as WorkOrderLoad : l)));
    const { error: err } = await writeLoad(loadNo, { [field]: val });
    if (err) { setError(looksOffline(err.message) ? 'No signal — that field didn\'t save. Try again when you have bars.' : err.message); return; }
    refresh();
    pingProgress();
  }

  async function removeLoad(load: WorkOrderLoad) {
    if (locked) return;
    // Drop anything queued for this load too.
    setQueued((cur) => {
      const n = Object.fromEntries(Object.entries(cur).filter(([, q]) => q.loadNo !== load.load_no));
      persistQueue(n); return n;
    });
    if (String(load.id).startsWith('queued-')) return;
    setBusy(`del${load.load_no}`);
    await supabase.from('work_order_loads').delete().eq('id', load.id);
    setBusy('');
    refresh();
    pingProgress();
  }

  const nextNo = view.length ? Math.max(...view.map((l) => l.load_no)) + 1 : 1;
  // A blank row sits ready under the last one so the next load is always a
  // single tap away — no "add a row" step between loads.
  const showBlank = !locked && view.length < MAX_LOADS;
  const tons = totalLoadTons(view);
  const count = countLoads(view);
  const queuedCount = Object.keys(queued).length;

  // ---- The floating stamp button ------------------------------------------
  // A driver mid-haul lives in the in/out cycle: load in → load out →
  // unload in → unload out → next load's in. After the first Load In on the
  // cards, this button floats over the page pre-armed with whichever stamp
  // comes next, so the whole day is the same thumb on the same spot. Hold and
  // drag to park it anywhere; the spot is remembered on the device.
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null);
  const fabRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FAB_POS_KEY);
      if (saved) {
        const p = JSON.parse(saved) as { x: number; y: number };
        if (Number.isFinite(p.x) && Number.isFinite(p.y)) setFabPos(p);
      }
    } catch { /* corner default is fine */ }
  }, []);

  // The next stamp in the cycle, walking the last load that has any time on
  // it. Null (no button) until the first Load In, and again once all
  // twenty-eight lines are done.
  function nextStamp(): { loadNo: number; key: LoadStampKey; label: string } | null {
    const keys = LOAD_STAMPS.map((s) => s.key);
    const stamped = [...view]
      .sort((a, b) => a.load_no - b.load_no)
      .filter((l) => keys.some((k) => l[`${k}_at` as keyof WorkOrderLoad]));
    if (stamped.length === 0) return null;
    const active = stamped[stamped.length - 1];
    for (const s of LOAD_STAMPS) {
      if (!active[`${s.key}_at` as keyof WorkOrderLoad]) {
        return { loadNo: active.load_no, key: s.key, label: s.label };
      }
    }
    if (active.load_no + 1 > MAX_LOADS) return null;
    return { loadNo: active.load_no + 1, key: 'load_in', label: 'Load in' };
  }
  const next = !locked && !loading ? nextStamp() : null;

  const clamp = (p: { x: number; y: number }) => {
    const w = fabRef.current?.offsetWidth ?? 140;
    const h = fabRef.current?.offsetHeight ?? 80;
    return {
      x: Math.min(Math.max(4, p.x), window.innerWidth - w - 4),
      y: Math.min(Math.max(4, p.y), window.innerHeight - h - 4),
    };
  };

  function fabPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = fabRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top, moved: false };
  }
  function fabPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    // A real drag, not a shaky thumb — below this it still counts as a tap.
    if (!d.moved && Math.hypot(dx, dy) < 8) return;
    d.moved = true;
    setFabPos(clamp({ x: d.origX + dx, y: d.origY + dy }));
  }
  function fabPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.moved) {
      // Parked: remember the spot on this device.
      setFabPos((p) => {
        try { if (p) localStorage.setItem(FAB_POS_KEY, JSON.stringify(p)); } catch { /* fine */ }
        return p;
      });
    } else if (next && !busy) {
      stamp(next.loadNo, next.key);
    }
  }

  const input = 'w-full px-2 py-2.5 border border-gray-300 rounded-md text-base';

  async function openBol(path: string) {
    const tab = window.open('about:blank', '_blank');
    const { data } = await supabase.storage.from('work-tickets').createSignedUrl(path, 300);
    if (data?.signedUrl && tab) tab.location.href = data.signedUrl; else tab?.close();
  }

  function stampButton(loadNo: number, key: LoadStampKey, label: string, load?: WorkOrderLoad) {
    const pk = `${loadNo}:${key}`;
    const saved = load ? (load[`${key}_at`] as string | null) : null;
    const shown = pending[pk] || saved;
    const lat = load ? (load[`${key}_lat`] as number | null) : null;
    const lng = load ? (load[`${key}_lng`] as number | null) : null;
    const hasFix = lat != null && lng != null;
    const working = busy === pk;
    const isQueued = !!queued[pk];

    if (shown) {
      // Where the stamp landed, against the order's pin for that end.
      const v = hasFix && !pending[pk] ? stampVerdict(pins, key, lat, lng) : null;
      const place = v?.status === 'ok'
        ? `✓ at ${EXPECTED_LABEL[v.expected]}`
        : v?.status === 'off'
          ? `⚠ ${fmtDistance(v.distance_m!)} from ${EXPECTED_LABEL[v.expected]}`
          : hasFix ? '📍 located' : null;
      const off = v?.status === 'off';
      return (
        <button
          key={key}
          type="button"
          onClick={() => (load && !locked ? clearStamp(load, key) : undefined)}
          disabled={locked || working}
          title={locked ? undefined : 'Tap to clear'}
          className={`flex flex-col items-center justify-center rounded-md border px-2 py-3 min-h-[64px] disabled:opacity-60 ${
            isQueued ? 'border-amber-300 bg-amber-50' : off ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50'
          }`}
        >
          <span className={`text-[10px] uppercase tracking-wide ${isQueued ? 'text-amber-800' : off ? 'text-red-800' : 'text-emerald-800'}`}>{label}</span>
          <span className={`text-sm font-semibold tabular-nums ${isQueued ? 'text-amber-900' : off ? 'text-red-900' : 'text-emerald-900'}`}>
            {clockOf(shown)}
          </span>
          <span className={`text-[10px] ${isQueued ? 'text-amber-700' : off ? 'text-red-700 font-medium' : 'text-emerald-700'}`}>
            {working ? 'saving…'
              : isQueued ? 'saved on phone · sends with signal'
              : pending[pk] ? 'locating…'
              : (place || 'no fix')}
          </span>
        </button>
      );
    }
    return (
      <button
        key={key}
        type="button"
        onClick={() => stamp(loadNo, key)}
        disabled={locked || working}
        className="flex flex-col items-center justify-center rounded-md border border-gray-300 bg-white px-2 py-3 min-h-[64px] hover:border-brand-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
      >
        <span className="text-[10px] uppercase tracking-wide text-gray-500">{label}</span>
        <span className="text-sm font-semibold text-brand-700">Tap</span>
        <span className="text-[10px] text-gray-400">{working ? 'saving…' : '—'}</span>
      </button>
    );
  }

  function loadCard(loadNo: number, load?: WorkOrderLoad) {
    return (
      <div key={loadNo} className={`rounded-lg border p-3 ${load ? 'border-gray-200 bg-white' : 'border-dashed border-gray-300 bg-gray-50'}`}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-sm font-semibold">
            Load {loadNo}
            {!load && <span className="ml-2 text-xs font-normal text-gray-500">tap a time to start it</span>}
          </span>
          {load && !locked && (
            <button
              type="button"
              onClick={() => removeLoad(load)}
              disabled={busy === `del${loadNo}`}
              className="text-xs text-red-600 hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {LOAD_STAMPS.map((s) => stampButton(loadNo, s.key, s.label, load))}
        </div>

        <div className="grid grid-cols-3 gap-2 mt-2">
          <label>
            <span className="block text-[11px] text-gray-500 mb-0.5">Ticket #</span>
            <input
              defaultValue={load?.ticket_number || ''}
              onBlur={(e) => setField(loadNo, 'ticket_number', e.target.value.trim())}
              disabled={locked}
              className={input}
            />
          </label>
          <label>
            <span className="block text-[11px] text-gray-500 mb-0.5">Tons</span>
            <input
              type="number" step="0.01" min="0" inputMode="decimal"
              defaultValue={load?.tons ?? ''}
              onBlur={(e) => setField(loadNo, 'tons', e.target.value.trim())}
              disabled={locked}
              className={input}
            />
          </label>
          <label>
            <span className="block text-[11px] text-gray-500 mb-0.5">Material</span>
            <input
              defaultValue={load?.material || ''}
              placeholder={defaultMaterial ? `" (${defaultMaterial})` : ''}
              onBlur={(e) => setField(loadNo, 'material', e.target.value.trim())}
              disabled={locked}
              className={input}
            />
          </label>
        </div>

        {/* The BOL / scale ticket: one photo per load, read into the boxes
            above. The photo is the paper behind the load. */}
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          {load?.bol_path ? (
            <>
              <button type="button" onClick={() => openBol(load.bol_path!)} className="px-3 py-2 text-sm rounded-md border border-emerald-300 bg-emerald-50 text-emerald-900 font-medium min-h-[44px]">
                ✓ BOL photo
              </button>
              {!locked && <button type="button" onClick={() => setField(loadNo, 'bol_path', '')} className="text-xs text-gray-400 hover:text-red-600">remove</button>}
            </>
          ) : !locked ? (
            <ScanButton kind="bol" bucket="work-tickets" folder={undefined} label="BOL photo" onScanned={(f, p) => applyBol(loadNo, f, p)} />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Loads</h2>
        <span className="text-sm text-gray-600">
          <strong>{count}</strong> {count === 1 ? 'load' : 'loads'} · <strong>{tons.toFixed(2)}</strong> tons
          {queuedCount > 0 && (
            <span className="ml-2 text-amber-800">· {queuedCount} stamp{queuedCount === 1 ? '' : 's'} waiting for signal</span>
          )}
        </span>
      </div>

      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-2">
          {view.map((l) => loadCard(l.load_no, l))}
          {showBlank && loadCard(nextNo)}
          {view.length >= MAX_LOADS && (
            <p className="text-xs text-gray-500">
              That&apos;s all twenty-eight lines — the same as the paper ticket. Start
              a second ticket for anything past this.
            </p>
          )}
        </div>
      )}

      {/* The floating next-stamp button. touch-none stops the page scrolling
          out from under a drag. */}
      {next && (
        <div
          ref={fabRef}
          onPointerDown={fabPointerDown}
          onPointerMove={fabPointerMove}
          onPointerUp={fabPointerUp}
          onPointerCancel={() => { dragRef.current = null; }}
          style={fabPos
            ? { left: fabPos.x, top: fabPos.y }
            : { right: 16, bottom: 90 }}
          className="fixed z-50 touch-none select-none cursor-grab active:cursor-grabbing"
        >
          <div className={`rounded-2xl shadow-xl border-2 px-5 py-3 text-center min-w-[132px] ${
            busy
              ? 'bg-gray-500 border-gray-500 text-white'
              : next.key.startsWith('load')
                ? 'bg-brand-700 border-brand-900 text-white'
                : 'bg-accent-400 border-accent-500 text-white'
          }`}>
            <span className="block text-[10px] uppercase tracking-wide opacity-80">
              Load {next.loadNo}
            </span>
            <span className="block text-lg font-bold leading-tight">
              {busy ? 'Saving…' : next.label}
            </span>
            <span className="block text-[9px] opacity-70 mt-0.5">
              tap to stamp · hold &amp; drag to move
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
