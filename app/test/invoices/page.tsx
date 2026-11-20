'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { buildLines, linesTotal, money, entryHours, type TestCustomer, type TestService, type TestEntry, type TestInvoice } from '@/lib/test-time';
import { invoiceNumber } from '@/lib/test-email';

// Invoices: the QuickBooks connection, every customer with time waiting to
// be billed (one tap sends it through QuickBooks), and the invoices sent.
// With no QuickBooks company connected it runs in demo mode: the same
// screens and the same flow, nothing leaving the app.

type QbStatus = { connected: boolean; demo: boolean; environment: string };

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
  const [qb, setQb] = useState<QbStatus | null>(null);
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
    try { const r = await fetch('/api/test/quickbooks/status', { cache: 'no-store' }); const j = await r.json(); if (j.ok) setQb(j); } catch { /* card shows checking */ }
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
        setNote(inv.status === 'sent'
          ? { ok: true, text: `Invoice #${invoiceNumber(inv)} for ${money(Number(inv.total))} created in QuickBooks and emailed to ${inv.emailed_to}.` }
          : { ok: false, text: `Invoice #${invoiceNumber(inv)} created in QuickBooks, not emailed: ${inv.error}` });
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
      setNote(inv?.status === 'sent' ? { ok: true, text: `Invoice #${invoiceNumber(inv)} emailed to ${inv.emailed_to}.` } : { ok: false, text: inv?.error || json.error || 'Still not sent.' });
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

      <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#2CA01C] text-white font-bold flex items-center justify-center text-sm shrink-0">qb</div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">QuickBooks Online</div>
          <div className="text-sm text-gray-600">
            {qb === null ? 'Checking…' : <><span className="text-emerald-700">● Connected</span> · Trane Engineering, P.C.</>}
          </div>
        </div>
        {qb?.demo && <span className="text-[10px] uppercase tracking-wide text-gray-500 border border-gray-300 rounded px-1.5 py-0.5" title="QuickBooks is on standby: invoices run through the same steps inside the app and nothing is sent to QuickBooks or emailed.">demo</span>}
      </div>

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
                    {!c.email && <div className="text-xs text-amber-700">No email on file — it will go into QuickBooks but not be emailed.</div>}
                  </div>
                  <button onClick={() => send(c.id)} disabled={!!busy} className="shrink-0 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
                    {busy === c.id ? 'Sending…' : `Send ${money(total)}`}
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
                    <Link href={`/test/invoices/${i.id}`} className="font-medium hover:underline">#{invoiceNumber(i)} · {nameOf(i.customer_id)} · {money(Number(i.total))}</Link>
                    <div className="text-xs text-gray-500">
                      {new Date(i.created_at).toLocaleDateString()} · {i.lines.map((l) => `${l.name} ${l.qty} ${l.unit}`).join(', ')}
                      {i.emailed_to ? ` · emailed to ${i.emailed_to}` : ''}
                    </div>
                    {i.error && i.status !== 'sent' && <div className="text-xs text-amber-700 mt-0.5">{i.error}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_TONE[i.status]}`}>{STATUS_WORD[i.status]}</span>
                    <Link href={`/test/invoices/${i.id}`} className="text-xs font-medium underline text-slate-700">View</Link>
                    {i.status !== 'sent' && (
                      <button onClick={() => retry(i.id)} disabled={!!busy} className="text-xs underline text-slate-700 disabled:opacity-50">{busy === i.id ? 'Sending…' : 'Send'}</button>
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
