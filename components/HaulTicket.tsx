'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import LoadLines from '@/components/LoadLines';
import TicketSignature from '@/components/TicketSignature';
import PaymentMethod from '@/components/PaymentMethod';
import AddressLink from '@/components/AddressLink';
import { COMPANY } from '@/lib/company';
import {
  onSiteHours, totalHours, lastUnloadAt, SAFETY_CHECK_ITEMS,
  type WorkOrder, type WorkOrderLoad,
} from '@/lib/work-orders';

// The driver's haul ticket. Everything the app already knows is filled in:
// the job, both addresses, the material, the driver, the truck. The start is
// the first Load In stamp and the end is the last Unload Out — the driver
// never types a time unless they choose to. What they do: tap the stamps,
// photograph each BOL, enter down time and travel time if there was any,
// and have the job foreman sign. Everything saves itself as it changes.

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export default function HaulTicket({ workOrder, onSaved }: { workOrder: WorkOrder; onSaved?: (wo: WorkOrder) => void }) {
  const supabase = createClient();
  const router = useRouter();
  const id = workOrder.id;
  const status = workOrder.status;
  const editable = status === 'draft' || status === 'rejected' || status === 'submitted';
  const locked = !editable;

  // The few things the driver may change. Everything else is read-only here.
  const [d, setD] = useState({
    unit_number: workOrder.unit_number || '',
    plate_number: workOrder.plate_number || '',
    truck_type: workOrder.truck_type || '',
    driver_name: workOrder.driver_name || '',
    travel_hours: workOrder.travel_hours != null ? String(workOrder.travel_hours) : '',
    down_hours: workOrder.down_hours != null ? String(workOrder.down_hours) : '',
    notes: workOrder.notes || '',
    payment_method: workOrder.payment_method || '',
    safety_initials: workOrder.safety_initials || '',
  });
  const [startAt, setStartAt] = useState<string | null>(workOrder.start_at);
  const [stopAt, setStopAt] = useState<string | null>(workOrder.stop_at);
  const [startAuto, setStartAuto] = useState<boolean>(workOrder.start_auto ?? true);
  const [stopAuto, setStopAuto] = useState<boolean>(workOrder.stop_auto ?? true);
  const [safety, setSafety] = useState<string[]>(workOrder.safety_check ?? []);
  const [safetyAt, setSafetyAt] = useState<string | null>(workOrder.safety_checked_at ?? null);
  const [showSafety, setShowSafety] = useState(false);
  const [foremanSig, setForemanSig] = useState<string | null>(workOrder.foreman_signature_path);
  const [foremanSigner, setForemanSigner] = useState<{ name: string | null; at: string | null }>({ name: workOrder.foreman_signature_name, at: workOrder.foreman_signature_signed_at });
  const [driverSig, setDriverSig] = useState<string | null>(workOrder.signature_path);
  const [driverSigner, setDriverSigner] = useState<{ name: string | null; at: string | null }>({ name: workOrder.signature_name, at: workOrder.signature_signed_at });
  const [showForeman, setShowForeman] = useState(false);
  const [showDriver, setShowDriver] = useState(false);
  const [editTimes, setEditTimes] = useState(false);
  const [loads, setLoads] = useState<WorkOrderLoad[]>([]);
  const [loadTotals, setLoadTotals] = useState({ loads: 0, tons: 0 });
  const [isHauler, setIsHauler] = useState(false);
  const [factorAllowed, setFactorAllowed] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<'' | 'saving' | 'saved'>('');
  const set = (k: keyof typeof d, v: string) => setD((x) => ({ ...x, [k]: v }));

  // Who's filling it in, and whether Factor Payment is on the table.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase.from('profiles').select('role, hauler_id, full_name, email').eq('id', user.id).single();
      const haulerSide = me?.role === 'hauler' || !!me?.hauler_id;
      setIsHauler(haulerSide);
      if (!d.driver_name && me) setD((x) => ({ ...x, driver_name: (me.full_name as string | null) || (me.email as string) || '' }));
      if (haulerSide) {
        try {
          const res = await fetch('/api/haulers/factoring-link', { cache: 'no-store' });
          const json = await res.json();
          setFactorAllowed(json.ok && json.status === 'linked');
        } catch { /* stays hidden */ }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The truck: last one used on this phone, then the fleet program's plate
  // and type for that unit.
  useEffect(() => {
    if (locked) return;
    (async () => {
      let unit = d.unit_number;
      if (!unit) {
        try { unit = localStorage.getItem('jst-last-unit') || ''; } catch { /* fine */ }
        if (unit) setD((x) => ({ ...x, unit_number: unit }));
      }
      if (unit && (!d.plate_number || !d.truck_type)) {
        const { data: t } = await supabase.from('fleet_trucks').select('plate, make, model').eq('unit_number', unit).limit(1).maybeSingle();
        const f = t as { plate: string | null; make: string | null; model: string | null } | null;
        if (f) setD((x) => ({ ...x, plate_number: x.plate_number || f.plate || '', truck_type: x.truck_type || [f.make, f.model].filter(Boolean).join(' ') }));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { try { if (d.unit_number) localStorage.setItem('jst-last-unit', d.unit_number); } catch { /* fine */ } }, [d.unit_number]);

  // Start = first Load In, End = last Unload Out, while the driver hasn't
  // taken over either one by hand.
  const onLoadsChange = useCallback((rows: WorkOrderLoad[]) => setLoads(rows), []);
  useEffect(() => {
    const ins = loads.map((l) => l.load_in_at).filter((x): x is string => !!x).sort();
    const last = lastUnloadAt(loads);
    if (startAuto && ins[0] && ins[0] !== startAt) setStartAt(ins[0]);
    if (stopAuto && last && last !== stopAt) setStopAt(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loads, startAuto, stopAuto]);

  // ---- Save as it changes -------------------------------------------------
  const body = useCallback(() => ({
    unit_number: d.unit_number.trim() || null,
    plate_number: d.plate_number.trim() || null,
    truck_type: d.truck_type.trim() || null,
    driver_name: d.driver_name.trim() || null,
    travel_hours: d.travel_hours === '' ? null : Number(d.travel_hours),
    down_hours: d.down_hours === '' ? null : Number(d.down_hours),
    notes: d.notes.trim() || null,
    payment_method: d.payment_method === 'factor' && !factorAllowed ? 'standard' : (d.payment_method || (isHauler ? 'standard' : null)),
    safety_check: safety,
    safety_initials: d.safety_initials.trim() || null,
    safety_checked_at: safetyAt,
    start_at: startAt, stop_at: stopAt, start_auto: startAuto, stop_auto: stopAuto,
    foreman_signature_path: foremanSig, foreman_signature_name: foremanSigner.name, foreman_signature_signed_at: foremanSigner.at,
    signature_path: driverSig, signature_name: driverSigner.name, signature_signed_at: driverSigner.at,
  }), [d, safety, safetyAt, startAt, stopAt, startAuto, stopAuto, foremanSig, foremanSigner, driverSig, driverSigner, factorAllowed, isHauler]);

  const firstRender = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef('');
  const save = useCallback(async (extra: Record<string, unknown> = {}) => {
    if (locked) return null;
    const payload = { ...body(), ...extra };
    setSaved('saving');
    try {
      const res = await fetch(`/api/work-orders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true });
      const json = await res.json();
      if (!json.ok) { setError(json.error || 'Could not save.'); setSaved(''); return json; }
      setSaved('saved'); setError('');
      onSaved?.(json.work_order as WorkOrder);
      fetch(`/api/work-orders/${id}/progress`, { method: 'POST', keepalive: true }).catch(() => null);
      return json;
    } catch {
      setError('No signal — changes will save when you have bars.'); setSaved('');
      return null;
    }
  }, [body, id, locked, onSaved]);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (locked) return;
    const snapshot = JSON.stringify(body());
    if (snapshot === lastSent.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { lastSent.current = snapshot; save(); }, 1200);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [body, locked, save]);

  // ---- Actions ------------------------------------------------------------
  function allOk() {
    setSafety(SAFETY_CHECK_ITEMS.map((i) => i.key));
    setSafetyAt(new Date().toISOString());
    if (!d.safety_initials) {
      const init = d.driver_name.split(/\s+/).map((w) => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 3);
      if (init) set('safety_initials', init);
    }
  }

  async function sharePdf() {
    setBusy('share'); setError('');
    try {
      if (!locked) await save();
      const res = await fetch(`/api/work-orders/${id}/ticket-pdf`, { method: 'POST' });
      const json = await res.json();
      if (!json.ok) { setError(json.error || 'Could not build the ticket PDF.'); return; }
      let shared = false;
      try {
        const blob = await fetch(json.url).then((r) => r.blob());
        const file = new File([blob], json.filename, { type: 'application/pdf' });
        if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Haul ticket' }); shared = true;
        }
      } catch (e) { if (e instanceof Error && e.name === 'AbortError') return; }
      if (!shared) { const tab = window.open('about:blank', '_blank'); if (tab) tab.location.href = json.url; else window.location.href = json.url; }
    } finally { setBusy(''); }
  }

  async function finishDay() {
    setError('');
    const stamped = loads.some((l) => l.load_in_at);
    if (!stamped) { setError('No loads on the ticket yet — tap Load In at the pit first.'); return; }
    if (!foremanSig || !foremanSigner.name) { setError('The job foreman needs to sign before the day goes in.'); setShowForeman(true); return; }
    // The end is the last stamp of the day if nothing newer has been set.
    const lastStamp = loads.flatMap((l) => [l.load_in_at, l.load_out_at, l.unload_in_at, l.unload_out_at]).filter((x): x is string => !!x).sort().pop() || null;
    const end = stopAt || lastStamp;
    const start = startAt || loads.map((l) => l.load_in_at).filter((x): x is string => !!x).sort()[0] || null;
    if (!start || !end) { setError('Could not work out the start and end — tap the times or type them.'); return; }
    if (end !== stopAt) setStopAt(end);
    if (start !== startAt) setStartAt(start);
    if (!window.confirm('Send today’s ticket to the office? You can’t change it after this unless they send it back.')) return;
    setBusy('finish');
    const json = await save({ start_at: start, stop_at: end, submit: true });
    setBusy('');
    if (json?.ok) router.refresh();
    else if (json?.bill_of_sale_url) setError(`${json.error} Open it under "How do you want this ticket paid?" below.`);
  }

  async function discard() {
    if (!window.confirm('Throw this ticket away?')) return;
    const res = await fetch(`/api/work-orders/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.ok) { router.push('/tickets'); router.refresh(); } else setError(json.error || 'Could not discard.');
  }

  // ---- Bits of the screen ------------------------------------------------
  const dayIdx = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(workOrder.job_date || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay() : new Date().getDay();
  }, [workOrder.job_date]);
  const truckHours = onSiteHours(startAt, stopAt);
  const total = totalHours({ start_at: startAt, stop_at: stopAt, travel_hours: Number(d.travel_hours) || 0, down_hours: Number(d.down_hours) || 0 });
  const lastUnload = lastUnloadAt(loads);
  const input = 'w-full px-2.5 py-2.5 border border-gray-300 rounded-md text-base disabled:bg-gray-100';
  const label = 'block text-[11px] font-medium text-gray-500 mb-0.5';
  const card = 'bg-white border border-gray-200 rounded-lg p-4';
  const row = (k: string, v: React.ReactNode) => (v ? <div className="flex gap-3 text-sm py-0.5"><span className="w-24 shrink-0 text-gray-500">{k}</span><span className="min-w-0">{v}</span></div> : null);

  return (
    <div className="space-y-3 pb-28">
      {/* The ticket header, like the pad */}
      <div className={`${card} border-2 border-brand-900`}>
        <div className="flex items-start justify-between gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/jst-logo.png" alt={COMPANY.name} className="h-10 w-auto" />
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Haul ticket</div>
            <div className="text-2xl font-bold text-accent-400 tabular-nums">{workOrder.ticket_number || '—'}</div>
          </div>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">{COMPANY.name} · {COMPANY.shortAddress}</p>

        <div className="flex items-center justify-between mt-3">
          <div className="flex gap-1">
            {DAYS.map((x, i) => (
              <span key={x} className={`text-[10px] px-1.5 py-0.5 rounded-full ${i === dayIdx ? 'border-2 border-brand-900 font-bold' : 'text-gray-400'}`}>{x}</span>
            ))}
          </div>
          <span className="text-sm font-semibold tabular-nums">{workOrder.job_date}</span>
        </div>

        <div className="mt-3 border-t border-gray-100 pt-2">
          {row('Customer', workOrder.customer_number)}
          {row('Job', [workOrder.job_name, workOrder.job_number ? `#${workOrder.job_number}` : null, workOrder.phase_code ? `Phase ${workOrder.phase_code}` : null].filter(Boolean).join(' · '))}
          {row('Pit', <AddressLink address={workOrder.pit_address} />)}
          {row('Job address', <AddressLink address={workOrder.job_address} />)}
          {row('Material', workOrder.material)}
          {!workOrder.order_id && !workOrder.job_number && (
            <p className="text-xs text-amber-700 mt-1">This ticket isn&apos;t on a dispatched load, so the job details are blank. Start tickets from <Link href="/hauler" className="underline">Loads</Link> and they fill themselves in.</p>
          )}
        </div>

        <div className="mt-3 border-t border-gray-100 pt-2">
          <label><span className={label}>Driver</span>
            <input value={d.driver_name} onChange={(e) => set('driver_name', e.target.value)} disabled={locked} className={input} /></label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <label><span className={label}>Truck #</span><input value={d.unit_number} onChange={(e) => set('unit_number', e.target.value)} disabled={locked} className={input} /></label>
            <label><span className={label}>Plate #</span><input value={d.plate_number} onChange={(e) => set('plate_number', e.target.value.toUpperCase())} disabled={locked} className={input} /></label>
            <label><span className={label}>Type of truck</span><input value={d.truck_type} onChange={(e) => set('truck_type', e.target.value)} disabled={locked} className={input} /></label>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3 border-t border-gray-100 pt-2">
          <div>
            <span className={label}>Start</span>
            {editTimes && !locked ? (
              <input type="datetime-local" value={toLocalInput(startAt)} onChange={(e) => { setStartAt(fromLocalInput(e.target.value)); setStartAuto(false); }} className={input} />
            ) : (
              <div className="text-lg font-semibold tabular-nums">{startAt ? clock(startAt) : <span className="text-sm font-normal text-amber-700">First Load In sets it</span>}</div>
            )}
            {startAuto ? <span className="text-[10px] text-gray-400">from the first Load In</span> : <button type="button" onClick={() => setStartAuto(true)} className="text-[10px] text-brand-700 underline">use the first Load In</button>}
          </div>
          <div>
            <span className={label}>End</span>
            {editTimes && !locked ? (
              <input type="datetime-local" value={toLocalInput(stopAt)} onChange={(e) => { setStopAt(fromLocalInput(e.target.value)); setStopAuto(false); }} className={input} />
            ) : (
              <div className="text-lg font-semibold tabular-nums">{stopAt ? clock(stopAt) : <span className="text-sm font-normal text-amber-700">Last Unload Out — or set by Finish</span>}</div>
            )}
            {stopAuto ? <span className="text-[10px] text-gray-400">from the last Unload Out</span> : <button type="button" onClick={() => setStopAuto(true)} className="text-[10px] text-brand-700 underline">use the last Unload Out</button>}
          </div>
          {!locked && <button type="button" onClick={() => setEditTimes((v) => !v)} className="col-span-2 text-xs text-brand-700 hover:underline text-left">{editTimes ? 'Done changing times' : 'Change the times by hand'}</button>}
        </div>
      </div>

      {/* Daily safety check — one tap when everything is fine */}
      <div className={card}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-sm font-medium">
            Daily safety check{' '}
            {safety.length === SAFETY_CHECK_ITEMS.length
              ? <span className="text-emerald-700">✓ all OK{safetyAt ? ` · ${clock(safetyAt)}` : ''}</span>
              : safety.length > 0 ? <span className="text-amber-700">{safety.length} of {SAFETY_CHECK_ITEMS.length}</span>
              : <span className="text-gray-500">not done</span>}
          </span>
          <div className="flex gap-3 items-center">
            {!locked && safety.length < SAFETY_CHECK_ITEMS.length && (
              <button type="button" onClick={allOk} className="px-3 py-2 text-sm rounded-md bg-emerald-600 text-white font-medium min-h-[44px]">All OK</button>
            )}
            <button type="button" onClick={() => setShowSafety((v) => !v)} className="text-sm text-brand-700 hover:underline">Items</button>
          </div>
        </div>
        {showSafety && (
          <div className="mt-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {SAFETY_CHECK_ITEMS.map((item) => (
                <label key={item.key} className="flex items-center gap-3 text-sm py-1 min-h-[40px]">
                  <input type="checkbox" checked={safety.includes(item.key)} disabled={locked} className="h-6 w-6 rounded border-gray-300 shrink-0"
                    onChange={(e) => { setSafety((cur) => (e.target.checked ? [...cur.filter((k) => k !== item.key), item.key] : cur.filter((k) => k !== item.key))); if (!safetyAt) setSafetyAt(new Date().toISOString()); }} />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
            <label className="block mt-2 max-w-[10rem]"><span className={label}>Initials</span>
              <input value={d.safety_initials} onChange={(e) => set('safety_initials', e.target.value.toUpperCase())} disabled={locked} className={input} maxLength={6} /></label>
          </div>
        )}
      </div>

      <LoadLines workOrderId={id} locked={locked} defaultMaterial={workOrder.material || ''} onTotalsChange={setLoadTotals} onLoadsChange={onLoadsChange} />

      {/* The day's numbers. The driver types only the two allowances. */}
      <div className={card}>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Total loads</span><span className="font-medium tabular-nums">{loadTotals.loads} · {loadTotals.tons.toFixed(1)} tons</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Truck hours</span><span className="font-medium tabular-nums">{truckHours.toFixed(1)}{startAt ? ` (${clock(startAt)} – ${stopAt ? clock(stopAt) : '…'})` : ''}</span></div>
          <div className="flex justify-between items-center gap-3">
            <span className="text-gray-500">Down time / breakdown (h)<span className="block text-[10px] text-gray-400">time the truck wasn&apos;t working</span></span>
            <input type="number" step="0.25" min="0" inputMode="decimal" value={d.down_hours} onChange={(e) => set('down_hours', e.target.value)} disabled={locked} className={`${input} w-24 text-right`} placeholder="0" />
          </div>
          <div className="flex justify-between items-center gap-3">
            <span className="text-gray-500">Travel / extra time (h)<span className="block text-[10px] text-gray-400">to the job, or held up at the pit</span></span>
            <input type="number" step="0.25" min="0" inputMode="decimal" value={d.travel_hours} onChange={(e) => set('travel_hours', e.target.value)} disabled={locked} className={`${input} w-24 text-right`} placeholder="0" />
          </div>
          <div className="flex justify-between border-t border-gray-100 pt-1.5"><span className="text-gray-500">Total hours</span><span className="font-semibold tabular-nums">{total.toFixed(1)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Last load unloaded</span><span className="tabular-nums">{lastUnload ? clock(lastUnload) : '—'}</span></div>
        </div>
      </div>

      <div className={card}>
        <label><span className={label}>Notes</span>
          <textarea rows={2} value={d.notes} onChange={(e) => set('notes', e.target.value)} disabled={locked} className={input} placeholder="Waits at the pit, scale down, detours…" /></label>
      </div>

      {isHauler && (
        <PaymentMethod id={id} locked={locked} value={d.payment_method} onChange={(v) => set('payment_method', v)} factorAllowed={factorAllowed} bosResetAt={workOrder.bos_reset_at} />
      )}

      {/* Signatures: the foreman's is what closes the day. */}
      <div className={card}>
        {foremanSig && foremanSigner.name && !showForeman ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm text-emerald-800">✓ Job foreman signed — {foremanSigner.name}{foremanSigner.at ? ` · ${clock(foremanSigner.at)}` : ''}</span>
            {!locked && <button type="button" onClick={() => setShowForeman(true)} className="text-xs text-brand-700 hover:underline">Change</button>}
          </div>
        ) : !showForeman ? (
          <button type="button" onClick={() => setShowForeman(true)} disabled={locked} className="w-full px-4 py-3 rounded-md border-2 border-amber-400 bg-amber-50 text-amber-900 font-medium text-base min-h-[52px] disabled:opacity-50">
            ✍ Job foreman signs
          </button>
        ) : null}
        {showForeman && (
          <div className="mt-2">
            <TicketSignature path={foremanSig} signerName={foremanSigner.name} signedAt={foremanSigner.at} onChange={setForemanSig}
              onSigned={(name, at) => { setForemanSigner({ name, at }); if (name) setShowForeman(false); }} readOnly={locked}
              label="Job foreman / superintendent" hint="They type their name and sign on site at the end of the day." />
          </div>
        )}
        <div className="mt-3">
          {driverSig && driverSigner.name && !showDriver ? (
            <span className="text-xs text-gray-600">Driver signed — {driverSigner.name}</span>
          ) : !showDriver ? (
            <button type="button" onClick={() => setShowDriver(true)} disabled={locked} className="text-xs text-brand-700 hover:underline disabled:opacity-50">Driver signs (optional)</button>
          ) : (
            <TicketSignature path={driverSig} signerName={driverSigner.name} signedAt={driverSigner.at} onChange={setDriverSig}
              onSigned={(name, at) => { setDriverSigner({ name, at }); if (name) setShowDriver(false); }} readOnly={locked} label="Driver" hint="Type your name, then sign." />
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-[11px] text-gray-400 h-4">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : ''}</p>

      <div className="space-y-2">
        <button type="button" onClick={sharePdf} disabled={busy === 'share'} className="w-full px-4 py-3 rounded-md border border-gray-300 bg-white text-sm font-medium min-h-[48px] disabled:opacity-50">
          {busy === 'share' ? 'Building the PDF…' : '⤴ Ticket PDF — view / share'}
        </button>
        {!locked && (status === 'draft' || status === 'rejected') && (
          <button type="button" onClick={finishDay} disabled={!!busy} className="w-full px-4 py-4 rounded-md bg-brand-900 text-white text-base font-semibold min-h-[56px] disabled:opacity-50">
            {busy === 'finish' ? 'Sending…' : status === 'rejected' ? '🏁 Fixed — send it back to the office' : '🏁 Finish day — send to the office'}
          </button>
        )}
        {status === 'submitted' && <p className="text-sm text-gray-600 text-center">Sent to the office. They&apos;ll send it back if anything needs fixing.</p>}
        {!locked && status === 'draft' && (
          <button type="button" onClick={discard} className="w-full text-xs text-red-700 hover:underline py-2">Discard this ticket</button>
        )}
      </div>
    </div>
  );
}
