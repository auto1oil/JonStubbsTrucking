'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import TicketAttachment from '@/components/TicketAttachment';
import { FLEET_BUCKET, US_STATES, money, type FleetFuel } from '@/lib/fleet';
import { useFleetScope, useTrucks, truckLabel, fInput, fLabel, fCard, fBtn, fBtnGhost, numOrNull, txtOrNull } from '@/lib/fleet-client';

// Fuel: every fill-up with gallons, the state it was bought in (IFTA credits
// tax paid at the pump by state), the odometer, and the receipt photo.

function FuelInner() {
  const supabase = createClient();
  const params = useSearchParams();
  const scope = useFleetScope();
  const { trucks } = useTrucks();
  const active = trucks.filter((t) => t.active);
  const [rows, setRows] = useState<FleetFuel[]>([]);
  const [adding, setAdding] = useState(params.get('add') === '1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [d, setD] = useState({
    truck_id: params.get('truck') || '', at: new Date().toISOString().slice(0, 16), gallons: '', total: '', odometer: '', state: 'UT', vendor: '', notes: '', file_path: null as string | null,
  });

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('fleet_fuel').select('*').order('at', { ascending: false }).limit(100);
    setRows((data as FleetFuel[]) || []);
  }, [supabase]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!d.truck_id && active.length > 0) {
      try { setD((x) => ({ ...x, truck_id: localStorage.getItem('jst-last-truck') || active[0].id })); } catch { setD((x) => ({ ...x, truck_id: active[0].id })); }
    }
  }, [active, d.truck_id]);

  async function save() {
    const gal = numOrNull(d.gallons);
    if (!d.truck_id || !gal || gal <= 0) { setError('Pick the truck and enter the gallons.'); return; }
    setBusy(true); setError('');
    const odo = numOrNull(d.odometer);
    const { error: err } = await supabase.from('fleet_fuel').insert({
      truck_id: d.truck_id, driver_id: scope?.userId ?? null, at: new Date(d.at).toISOString(), gallons: gal, total: numOrNull(d.total),
      odometer: odo, state: d.state, vendor: txtOrNull(d.vendor), notes: txtOrNull(d.notes), file_path: d.file_path,
    });
    if (!err && odo != null) {
      const t = trucks.find((x) => x.id === d.truck_id);
      if (t && (t.odometer == null || odo > t.odometer)) await supabase.from('fleet_trucks').update({ odometer: odo }).eq('id', d.truck_id);
    }
    setBusy(false);
    if (err) { setError(err.message); return; }
    try { localStorage.setItem('jst-last-truck', d.truck_id); } catch { /* fine */ }
    setD({ ...d, gallons: '', total: '', odometer: '', vendor: '', notes: '', file_path: null, at: new Date().toISOString().slice(0, 16) });
    setAdding(false); refresh();
  }
  async function remove(id: string) {
    if (!window.confirm('Remove this fill-up?')) return;
    await supabase.from('fleet_fuel').delete().eq('id', id); refresh();
  }
  const open = (path: string) => async () => {
    const tab = window.open('about:blank', '_blank');
    const { data } = await supabase.storage.from(FLEET_BUCKET).createSignedUrl(path, 300);
    if (data?.signedUrl && tab) tab.location.href = data.signedUrl; else tab?.close();
  };
  const unitOf = (id: string) => trucks.find((t) => t.id === id)?.unit_number || '?';

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Fuel</h1>
        <button onClick={() => setAdding((v) => !v)} className="text-sm text-brand-700 hover:underline">{adding ? 'Close' : '+ Log fuel'}</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {adding && (
        <div className={fCard}>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2"><span className={fLabel}>Truck</span>
              <select value={d.truck_id} onChange={(e) => setD({ ...d, truck_id: e.target.value })} className={fInput}>
                {active.map((t) => <option key={t.id} value={t.id}>{truckLabel(t)}</option>)}
              </select></label>
            <label><span className={fLabel}>Gallons</span><input type="number" step="0.001" inputMode="decimal" value={d.gallons} onChange={(e) => setD({ ...d, gallons: e.target.value })} className={`${fInput} text-lg`} /></label>
            <label><span className={fLabel}>Total paid</span><input type="number" step="0.01" inputMode="decimal" value={d.total} onChange={(e) => setD({ ...d, total: e.target.value })} className={`${fInput} text-lg`} /></label>
            <label><span className={fLabel}>State bought in</span>
              <select value={d.state} onChange={(e) => setD({ ...d, state: e.target.value })} className={fInput}>{US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            <label><span className={fLabel}>Odometer</span><input type="number" inputMode="numeric" value={d.odometer} onChange={(e) => setD({ ...d, odometer: e.target.value })} className={fInput} /></label>
            <label><span className={fLabel}>When</span><input type="datetime-local" value={d.at} onChange={(e) => setD({ ...d, at: e.target.value })} className={fInput} /></label>
            <label><span className={fLabel}>Station</span><input value={d.vendor} onChange={(e) => setD({ ...d, vendor: e.target.value })} className={fInput} placeholder="Maverik, Spanish Fork" /></label>
            <label className="col-span-2"><span className={fLabel}>Notes</span><input value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} className={fInput} /></label>
            <div className="col-span-2"><TicketAttachment label="Receipt" hint="Snap the pump receipt." path={d.file_path} onChange={(p) => setD({ ...d, file_path: p })} bucket={FLEET_BUCKET} folder={scope?.folder} /></div>
            <div className="col-span-2 flex gap-2">
              <button onClick={save} disabled={busy} className={fBtn}>{busy ? 'Saving…' : 'Save fill-up'}</button>
              <button onClick={() => setAdding(false)} className={fBtnGhost}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className={fCard}>
        {rows.length === 0 ? <p className="text-sm text-gray-500">No fuel logged yet.</p> : (
          <ul className="divide-y divide-gray-100 text-sm">
            {rows.map((f) => (
              <li key={f.id} className="py-2 flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">Unit {unitOf(f.truck_id)} · {Number(f.gallons).toFixed(1)} gal in {f.state}{f.total != null ? ` · ${money(f.total)}` : ''}</div>
                  <div className="text-xs text-gray-500">{new Date(f.at).toLocaleString()}{f.odometer != null ? ` · ${f.odometer.toLocaleString()} mi` : ''}{f.vendor ? ` · ${f.vendor}` : ''}{f.notes ? ` · ${f.notes}` : ''}</div>
                </div>
                <div className="flex gap-3 text-xs shrink-0">
                  {f.file_path && <button onClick={open(f.file_path)} className="text-brand-700 hover:underline">Receipt</button>}
                  <button onClick={() => remove(f.id)} className="text-gray-400 hover:text-red-600">Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function FuelPage() {
  return <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}><FuelInner /></Suspense>;
}
