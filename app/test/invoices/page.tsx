'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { buildLines, linesTotal, money, entryHours, type TestCustomer, type TestService, type TestEntry, type TestInvoice } from '@/lib/test-time';
import { invoiceMailto, invoiceNumber } from '@/lib/test-email';

// Invoices: every customer with time waiting to be billed (one tap creates
// the invoice), and the invoices made, each with Email it. QuickBooks comes
// later with the real app; the connection code is in lib/test-qb.ts.

const STATUS_TONE: Record<string, string> = {
  sent: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  invoiced: 'bg-blue-100 text-blue-800 border-blue-200',
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
};
const STATUS_WORD: Record<string, string> = { sent: 'Emailed', invoiced: 'In QuickBooks', draft: 'Invoiced', failed: 'Not sent' };

function InvoicesInner() {
  const supabase = createClient();
  const params = useSearchParams();
  const [customers, setCustomers] = useState<TestCustomer[]>([]);
  const [services, setServices] = useState<TestService[]>([]);
  const [unbilled, setUnbilled] = useState<TestEntry[]>([]);
  const [invoices, setInvoices] = useState<TestInvoice[]>([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [{ data: c }, { data: s }, { data: u }, { data: i }] = await Promise.all([
      supabase.from('test_customers').select('*').order('name'),
      supabase.from('test_services').select('*'),
      supabase.from('test_time_entries').select('*').is('invoice_id', null).not('clock_out_at', 'is', null),
      supabase.from('test_invoices').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    setCustomers((c as TestCustomer[]) || []); setServices((s as TestService[]) || []);
    setUnbilled((u as TestEntry[]) || []); setInvoices((i as TestInvoice[]) || []);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const q = params.get('qb');
    if (!q) return;
    if (q === 'connected') setNote({ ok: true, text: 'QuickBooks connected for Trane Engineering.' });
    else if (q === 'not_configured') setNote({ ok: false, text: 'The Intuit app keys aren’t set in Vercel yet (QUICKBOOKS_CLIENT_ID / SECRET, or TEST_QUICKBOOKS_CLIENT_ID / SECRET).' });
    else setNote({ ok: false, text: `QuickBooks connection failed: ${decodeURIComponent(q)}` });
  }, [params]);

  async function send(customerId: string) {
    setBusy(customerId); setNote(null);
    try {
      const res = await fetch('/api/test/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_id: customerId }) });
      const json = await res.json();
      if (!json.ok) setNote({ ok: false, text: json.error || 'Could not invoice.' });
      else {
        const inv = json.invoice as TestInvoice;
        setNote({ ok: true, text: `Invoice ${invoiceNumber(inv)} for ${money(Number(inv.total))} created — tap Email below to send it.` });
      }
    } catch { setNote({ ok: false, text: 'No signal — try again.' }); }
    setBusy(''); load();
  }
  async function retry(id: string) {
    setBusy(id); setNote(null);
    try {
      const res = await fetch(`/api/test/invoice/${id}/send`, { method: 'POST' });
      const json = await res.json();
      const inv = json.invoice as TestInvoice | undefined;
      setNote(inv?.status === 'sent' ? { ok: true, text: `Emailed to ${inv.emailed_to}.` } : { ok: false, text: inv?.error || json.error || 'Still not sent.' });
    } catch { setNote({ ok: false, text: 'No signal — try again.' }); }
    setBusy(''); load();
  }

  const byCustomer = customers
    .map((c) => {
      const ents = unbilled.filter((e) => e.customer_id === c.id);
      const lines = buildLines(ents, services);
      return { c, ents, lines, total: linesTotal(lines), hours: ents.reduce((n, e) => n + entryHours(e), 0) };
    })
    .filter((x) => x.ents.length > 0);
  const nameOf = (id: string) => customers.find((c) => c.id === id)?.name || 'Customer';

  return (
    <div className="space-y-4">
      {note && <p className={`text-sm rounded-lg px-3 py-2 border ${note.ok ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'}`}>{note.text}</p>}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="font-semibold mb-2">Ready to invoice</h2>
        {byCustomer.length === 0 ? <p className="text-sm text-gray-500">Nothing waiting. Time you clock shows up here.</p> : (
          <ul className="divide-y divide-gray-100">
            {byCustomer.map(({ c, ents, lines, total, hours }) => (
              <li key={c.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-gray-500">{ents.length} visit{ents.length === 1 ? '' : 's'} · {hours.toFixed(2)} h · {lines.map((l) => `${l.name} ${l.qty} ${l.unit}`).join(', ')}</div>
                    {!c.email && <div className="text-xs text-amber-700">No email on file — add one on Customers to email the invoice.</div>}
                  </div>
                  <button onClick={() => send(c.id)} disabled={!!busy} className="shrink-0 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
                    {busy === c.id ? 'Creating…' : `Invoice ${money(total)}`}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="font-semibold mb-2">Invoices</h2>
        {invoices.length === 0 ? <p className="text-sm text-gray-500">None yet.</p> : (
          <ul className="divide-y divide-gray-100">
            {invoices.map((i) => (
              <li key={i.id} className="py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{nameOf(i.customer_id)} · {money(Number(i.total))} · {invoiceNumber(i)}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(i.created_at).toLocaleDateString()} · {i.lines.map((l) => `${l.name} ${l.qty} ${l.unit}`).join(', ')}
                      {i.emailed_to ? ` · emailed to ${i.emailed_to}` : ''}
                    </div>
                    {i.error && i.status === 'failed' && <div className="text-xs text-red-700 mt-0.5">{i.error}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_TONE[i.status]}`}>{STATUS_WORD[i.status]}</span>
                    {(() => {
                      const c = customers.find((x) => x.id === i.customer_id);
                      return c?.email ? <a href={invoiceMailto(i, c)} className="text-xs font-medium underline text-emerald-800">Email</a> : null;
                    })()}
                    {i.status === 'failed' && (
                      <button onClick={() => retry(i.id)} disabled={!!busy} className="text-xs underline text-slate-700 disabled:opacity-50">{busy === i.id ? 'Trying…' : 'Retry'}</button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  return <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}><InvoicesInner /></Suspense>;
}
