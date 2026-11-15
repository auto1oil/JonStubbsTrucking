'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import TicketAttachment from '@/components/TicketAttachment';
import { FLEET_BUCKET, RECEIPT_CATEGORIES, money, type FleetReceipt } from '@/lib/fleet';
import { useFleetScope, useTrucks, truckLabel, fInput, fLabel, fCard, fBtn, fBtnGhost, numOrNull, txtOrNull } from '@/lib/fleet-client';

// Receipts for everything that isn't fuel: tolls, scales, parts, a motel.
// A photo and an amount; the truck if it belongs to one.

function ReceiptsInner() {
  const supabase = createClient();
  const params = useSearchParams();
  const scope = useFleetScope();
  const { trucks } = useTrucks();
  const [rows, setRows] = useState<FleetReceipt[]>([]);
  const [adding, setAdding] = useState(params.get('add') === '1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [d, setD] = useState({ truck_id: '', at: new Date().toISOString().slice(0, 10), amount: '', category: 'toll', vendor: '', notes: '', file_path: null as string | null });

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('fleet_receipts').select('*').order('at', { ascending: false }).limit(100);
    setRows((data as FleetReceipt[]) || []);
  }, [supabase]);
  useEffect(() => { refresh(); }, [refresh]);

  async function save() {
    const amt = numOrNull(d.amount);
    if (!amt || amt <= 0) { setError('Enter the amount.'); return; }
    setBusy(true); setError('');
    const { error: err } = await supabase.from('fleet_receipts').insert({
      truck_id: d.truck_id || null, driver_id: scope?.userId ?? null, at: new Date(d.at + 'T12:00:00').toISOString(), amount: amt,
      category: d.category, vendor: txtOrNull(d.vendor), notes: txtOrNull(d.notes), file_path: d.file_path,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setD({ ...d, amount: '', vendor: '', notes: '', file_path: null }); setAdding(false); refresh();
  }
  async function remove(id: string) {
    if (!window.confirm('Remove this receipt?')) return;
    await supabase.from('fleet_receipts').delete().eq('id', id); refresh();
  }
  const open = (path: string) => async () => {
    const tab = window.open('about:blank', '_blank');
    const { data } = await supabase.storage.from(FLEET_BUCKET).createSignedUrl(path, 300);
    if (data?.signedUrl && tab) tab.location.href = data.signedUrl; else tab?.close();
  };
  const total = rows.reduce((n, r) => n + Number(r.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Receipts</h1>
        <button onClick={() => setAdding((v) => !v)} className="text-sm text-brand-700 hover:underline">{adding ? 'Close' : '+ Add receipt'}</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {adding && (
        <div className={fCard}>
          <div className="grid grid-cols-2 gap-3">
            <label><span className={fLabel}>Amount</span><input type="number" step="0.01" inputMode="decimal" value={d.amount} onChange={(e) => setD({ ...d, amount: e.target.value })} className={`${fInput} text-lg`} /></label>
            <label><span className={fLabel}>What for</span>
              <select value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })} className={fInput}>{RECEIPT_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
            <label><span className={fLabel}>Truck (if one)</span>
              <select value={d.truck_id} onChange={(e) => setD({ ...d, truck_id: e.target.value })} className={fInput}>
                <option value="">— None —</option>{trucks.map((t) => <option key={t.id} value={t.id}>{truckLabel(t)}</option>)}
              </select></label>
            <label><span className={fLabel}>Date</span><input type="date" value={d.at} onChange={(e) => setD({ ...d, at: e.target.value })} className={fInput} /></label>
            <label><span className={fLabel}>Who it was paid to</span><input value={d.vendor} onChange={(e) => setD({ ...d, vendor: e.target.value })} className={fInput} /></label>
            <label><span className={fLabel}>Notes</span><input value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} className={fInput} /></label>
            <div className="col-span-2"><TicketAttachment label="Receipt" hint="Snap it before it fades." path={d.file_path} onChange={(p) => setD({ ...d, file_path: p })} bucket={FLEET_BUCKET} folder={scope?.folder} /></div>
            <div className="col-span-2 flex gap-2">
              <button onClick={save} disabled={busy} className={fBtn}>{busy ? 'Saving…' : 'Save receipt'}</button>
              <button onClick={() => setAdding(false)} className={fBtnGhost}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className={fCard}>
        {rows.length === 0 ? <p className="text-sm text-gray-500">No receipts yet.</p> : (
          <>
            <p className="text-xs text-gray-500 mb-2">Last {rows.length} · {money(total)}</p>
            <ul className="divide-y divide-gray-100 text-sm">
              {rows.map((r) => (
                <li key={r.id} className="py-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{money(r.amount)} · {RECEIPT_CATEGORIES.find((c) => c.key === r.category)?.label}{r.vendor ? ` · ${r.vendor}` : ''}</div>
                    <div className="text-xs text-gray-500">{new Date(r.at).toLocaleDateString()}{r.truck_id ? ` · Unit ${trucks.find((t) => t.id === r.truck_id)?.unit_number || '?'}` : ''}{r.notes ? ` · ${r.notes}` : ''}</div>
                  </div>
                  <div className="flex gap-3 text-xs shrink-0">
                    {r.file_path && <button onClick={open(r.file_path)} className="text-brand-700 hover:underline">Open</button>}
                    <button onClick={() => remove(r.id)} className="text-gray-400 hover:text-red-600">Remove</button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export default function ReceiptsPage() {
  return <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}><ReceiptsInner /></Suspense>;
}
