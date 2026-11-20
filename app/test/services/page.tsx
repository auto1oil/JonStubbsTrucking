'use client';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { money, type TestService } from '@/lib/test-time';

// Services: what Trane bills. An hourly service turns clocked time into
// hours × rate; a per-visit service bills once per clock-in. Add one with
// a name and a rate; edit or retire any of them in place.

export default function ServicesPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<TestService[]>([]);
  const [d, setD] = useState({ name: '', rate: '', unit: 'hour' as 'hour' | 'each' });
  const [editing, setEditing] = useState<Record<string, { name: string; rate: string; unit: 'hour' | 'each' }>>({});
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('test_services').select('*').order('active', { ascending: false }).order('sort').order('name');
    setRows((data as TestService[]) || []);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    const rate = Number(d.rate);
    if (!d.name.trim() || !Number.isFinite(rate) || rate < 0) { setError('Give it a name and a rate.'); return; }
    const { error: err } = await supabase.from('test_services').insert({ name: d.name.trim(), rate, unit: d.unit, sort: rows.length + 1 });
    if (err) { setError(err.message); return; }
    setD({ name: '', rate: '', unit: 'hour' }); setError(''); load();
  }
  async function save(id: string) {
    const e = editing[id]; const rate = Number(e.rate);
    if (!e.name.trim() || !Number.isFinite(rate) || rate < 0) { setError('Give it a name and a rate.'); return; }
    // A renamed service gets a fresh QuickBooks item the next time it's invoiced.
    const before = rows.find((r) => r.id === id);
    const { error: err } = await supabase.from('test_services').update({
      name: e.name.trim(), rate, unit: e.unit, ...(before && before.name !== e.name.trim() ? { qb_item_id: null } : {}),
    }).eq('id', id);
    if (err) { setError(err.message); return; }
    setEditing((x) => { const n = { ...x }; delete n[id]; return n; }); setError(''); load();
  }
  async function toggle(s: TestService) {
    await supabase.from('test_services').update({ active: !s.active }).eq('id', s.id); load();
  }

  const input = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base';
  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="font-semibold mb-2">Add a service</h2>
        <div className="grid grid-cols-6 gap-2">
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Plan review" className={`${input} col-span-6 sm:col-span-3`} />
          <input value={d.rate} onChange={(e) => setD({ ...d, rate: e.target.value })} placeholder="Rate $" type="number" inputMode="decimal" step="0.01" className={`${input} col-span-3 sm:col-span-1`} />
          <select value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value as 'hour' | 'each' })} className={`${input} col-span-3 sm:col-span-1 bg-white`}>
            <option value="hour">per hour</option><option value="each">per visit</option>
          </select>
          <button onClick={add} className="col-span-6 sm:col-span-1 px-4 py-2.5 rounded-lg bg-slate-900 text-white font-medium">Add</button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {rows.length === 0 && <p className="p-4 text-sm text-gray-500">No services yet.</p>}
        {rows.map((s) => {
          const e = editing[s.id];
          return (
            <div key={s.id} className={`p-4 ${s.active ? '' : 'opacity-50'}`}>
              {e ? (
                <div className="grid grid-cols-6 gap-2">
                  <input value={e.name} onChange={(x) => setEditing({ ...editing, [s.id]: { ...e, name: x.target.value } })} className={`${input} col-span-6 sm:col-span-3`} />
                  <input value={e.rate} onChange={(x) => setEditing({ ...editing, [s.id]: { ...e, rate: x.target.value } })} type="number" inputMode="decimal" step="0.01" className={`${input} col-span-3 sm:col-span-1`} />
                  <select value={e.unit} onChange={(x) => setEditing({ ...editing, [s.id]: { ...e, unit: x.target.value as 'hour' | 'each' } })} className={`${input} col-span-3 sm:col-span-1 bg-white`}>
                    <option value="hour">per hour</option><option value="each">per visit</option>
                  </select>
                  <div className="col-span-6 sm:col-span-1 flex gap-2">
                    <button onClick={() => save(s.id)} className="px-3 py-2 rounded-lg bg-slate-900 text-white text-sm">Save</button>
                    <button onClick={() => setEditing((x) => { const n = { ...x }; delete n[s.id]; return n; })} className="px-3 py-2 rounded-lg border text-sm">×</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-sm text-gray-600">{money(Number(s.rate))} {s.unit === 'each' ? 'per visit' : 'per hour'}{s.active ? '' : ' · retired'}</div>
                  </div>
                  <div className="flex gap-3 text-sm">
                    <button onClick={() => setEditing({ ...editing, [s.id]: { name: s.name, rate: String(s.rate), unit: s.unit } })} className="underline text-slate-700">Edit</button>
                    <button onClick={() => toggle(s)} className="underline text-gray-500">{s.active ? 'Retire' : 'Bring back'}</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-500">Clocked time is the quantity: 2 h 30 m of Site visit at $200/hr bills 2.5 × $200 = $500.</p>
    </div>
  );
}
