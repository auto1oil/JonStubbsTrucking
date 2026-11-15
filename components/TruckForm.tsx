'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { US_STATES, type FleetTruck } from '@/lib/fleet';
import { fInput, fLabel, fCard, fBtn, fBtnGhost, numOrNull, txtOrNull } from '@/lib/fleet-client';

// Add or edit a truck. Unit number is the one thing it needs; the rest fills
// in as the paperwork comes.
export default function TruckForm({ truck, onSaved }: { truck: FleetTruck | null; onSaved?: (t: FleetTruck) => void }) {
  const supabase = createClient();
  const router = useRouter();
  const v = (x: unknown) => (x === null || x === undefined ? '' : String(x));
  const [d, setD] = useState({
    unit_number: v(truck?.unit_number), make: v(truck?.make), model: v(truck?.model), year: v(truck?.year),
    vin: v(truck?.vin), plate: v(truck?.plate), plate_state: v(truck?.plate_state) || 'UT',
    odometer: v(truck?.odometer), notes: v(truck?.notes), active: truck ? truck.active : true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, val: string | boolean) => setD((x) => ({ ...x, [k]: val }));

  async function save() {
    if (!d.unit_number.trim()) { setError('Give the truck a unit number.'); return; }
    setBusy(true); setError('');
    const row = {
      unit_number: d.unit_number.trim(), make: txtOrNull(d.make), model: txtOrNull(d.model), year: numOrNull(d.year),
      vin: txtOrNull(d.vin), plate: txtOrNull(d.plate), plate_state: txtOrNull(d.plate_state),
      odometer: numOrNull(d.odometer), notes: txtOrNull(d.notes), active: d.active,
    };
    const { data, error: err } = truck
      ? await supabase.from('fleet_trucks').update(row).eq('id', truck.id).select('*').single()
      : await supabase.from('fleet_trucks').insert(row).select('*').single();
    setBusy(false);
    if (err) { setError(err.message); return; }
    onSaved?.(data as FleetTruck);
    if (!truck) router.push(`/fleet/trucks/${(data as FleetTruck).id}`);
  }

  return (
    <div className={fCard}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <label><span className={fLabel}>Unit number</span>
          <input value={d.unit_number} onChange={(e) => set('unit_number', e.target.value)} className={fInput} placeholder="248" /></label>
        <label><span className={fLabel}>Year</span>
          <input type="number" inputMode="numeric" value={d.year} onChange={(e) => set('year', e.target.value)} className={fInput} /></label>
        <label><span className={fLabel}>Make</span>
          <input value={d.make} onChange={(e) => set('make', e.target.value)} className={fInput} placeholder="Kenworth" /></label>
        <label><span className={fLabel}>Model</span>
          <input value={d.model} onChange={(e) => set('model', e.target.value)} className={fInput} placeholder="T880" /></label>
        <label className="col-span-2"><span className={fLabel}>VIN</span>
          <input value={d.vin} onChange={(e) => set('vin', e.target.value.toUpperCase())} className={`${fInput} font-mono`} /></label>
        <label><span className={fLabel}>Plate</span>
          <input value={d.plate} onChange={(e) => set('plate', e.target.value.toUpperCase())} className={fInput} /></label>
        <label><span className={fLabel}>Plate state</span>
          <select value={d.plate_state} onChange={(e) => set('plate_state', e.target.value)} className={fInput}>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></label>
        <label><span className={fLabel}>Odometer (latest)</span>
          <input type="number" inputMode="numeric" value={d.odometer} onChange={(e) => set('odometer', e.target.value)} className={fInput} /></label>
        <label className="col-span-2 sm:col-span-3"><span className={fLabel}>Notes</span>
          <textarea rows={2} value={d.notes} onChange={(e) => set('notes', e.target.value)} className={fInput} /></label>
        {truck && (
          <label className="col-span-2 sm:col-span-3 flex items-center gap-3 text-sm py-1">
            <input type="checkbox" checked={d.active} onChange={(e) => set('active', e.target.checked)} className="h-5 w-5 rounded border-gray-300" />
            In service (unticked trucks drop out of the pickers)
          </label>
        )}
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={save} disabled={busy} className={fBtn}>{busy ? 'Saving…' : truck ? 'Save truck' : 'Add truck'}</button>
        {!truck && <button onClick={() => router.push('/fleet')} className={fBtnGhost}>Cancel</button>}
      </div>
    </div>
  );
}
