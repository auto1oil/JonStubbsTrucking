'use client';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import type { TestCustomer } from '@/lib/test-time';

// Trane Engineering's customers. The email is where QuickBooks sends the
// invoice; the first invoice creates the customer in QuickBooks too.

const blank = { name: '', email: '', phone: '', address: '' };

export default function CustomersPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<TestCustomer[]>([]);
  const [d, setD] = useState(blank);
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('test_customers').select('*').order('active', { ascending: false }).order('name');
    setRows((data as TestCustomer[]) || []);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!d.name.trim()) { setError('Give the customer a name.'); return; }
    const row = { name: d.name.trim(), email: d.email.trim() || null, phone: d.phone.trim() || null, address: d.address.trim() || null };
    const { error: err } = editId
      ? await supabase.from('test_customers').update(row).eq('id', editId)
      : await supabase.from('test_customers').insert(row);
    if (err) { setError(err.message); return; }
    setD(blank); setEditId(null); setError(''); load();
  }
  async function toggle(c: TestCustomer) { await supabase.from('test_customers').update({ active: !c.active }).eq('id', c.id); load(); }

  const input = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-base';
  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="font-semibold mb-2">{editId ? 'Edit customer' : 'Add a customer'}</h2>
        <div className="grid grid-cols-2 gap-2">
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Name (e.g. Lehi City)" className={`${input} col-span-2`} />
          <input value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} placeholder="Billing email" type="email" className={`${input} col-span-2 sm:col-span-1`} />
          <input value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} placeholder="Phone" type="tel" className={`${input} col-span-2 sm:col-span-1`} />
          <input value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} placeholder="Billing address" className={`${input} col-span-2`} />
          <div className="col-span-2 flex gap-2">
            <button onClick={save} className="px-4 py-2.5 rounded-lg bg-slate-900 text-white font-medium">{editId ? 'Save' : 'Add customer'}</button>
            {editId && <button onClick={() => { setEditId(null); setD(blank); }} className="px-4 py-2.5 rounded-lg border">Cancel</button>}
          </div>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {rows.length === 0 && <p className="p-4 text-sm text-gray-500">No customers yet.</p>}
        {rows.map((c) => (
          <div key={c.id} className={`p-4 flex items-start justify-between gap-3 ${c.active ? '' : 'opacity-50'}`}>
            <div className="min-w-0">
              <div className="font-medium">{c.name}</div>
              <div className="text-sm text-gray-600">{[c.email || <span key="e" className="text-amber-700">no email — invoices can&apos;t be emailed</span>, c.phone].filter(Boolean).map((x, i) => <span key={i}>{i ? ' · ' : ''}{x}</span>)}</div>
              {c.address && <div className="text-xs text-gray-500">{c.address}</div>}
              {c.qb_customer_id && <div className="text-[11px] text-gray-400">In QuickBooks</div>}
            </div>
            <div className="flex gap-3 text-sm shrink-0">
              <button onClick={() => { setEditId(c.id); setD({ name: c.name, email: c.email || '', phone: c.phone || '', address: c.address || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="underline text-slate-700">Edit</button>
              <button onClick={() => toggle(c)} className="underline text-gray-500">{c.active ? 'Hide' : 'Show'}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
