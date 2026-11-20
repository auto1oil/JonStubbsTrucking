'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { money, type TestCustomer, type TestInvoice } from '@/lib/test-time';
import { TRANE, invoiceMailto, invoiceNumber } from '@/lib/test-email';

// The invoice as the customer would get it from QuickBooks: the company
// header, bill-to, number, dates, terms, the lines, and the balance due
// with a Pay button. In demo mode the Pay button does nothing.

const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

export default function InvoiceView({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [inv, setInv] = useState<TestInvoice | null>(null);
  const [cust, setCust] = useState<TestCustomer | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('test_invoices').select('*').eq('id', params.id).maybeSingle();
      if (!data) { setMissing(true); return; }
      const i = data as TestInvoice; setInv(i);
      const { data: c } = await supabase.from('test_customers').select('*').eq('id', i.customer_id).maybeSingle();
      setCust((c as TestCustomer | null) ?? null);
    })();
  }, [supabase, params.id]);

  if (missing) return <p className="text-sm text-gray-500">That invoice isn&apos;t here.</p>;
  if (!inv) return <p className="text-sm text-gray-500">Loading…</p>;

  const date = new Date(inv.created_at);
  const due = new Date(date); due.setDate(due.getDate() + 30);
  const demo = !inv.qb_invoice_id || inv.qb_invoice_id.startsWith('demo-');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link href="/test/invoices" className="text-sm text-slate-700 underline">← Invoices</Link>
        <div className="flex gap-3 text-sm">
          {cust?.email && <a href={invoiceMailto(inv, cust)} className="underline text-slate-700">Email from my phone</a>}
          <button onClick={() => window.print()} className="underline text-slate-700">Print</button>
        </div>
      </div>

      {inv.status === 'sent' && (
        <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          ✓ Sent from QuickBooks to {inv.emailed_to}{inv.sent_at ? ` · ${new Date(inv.sent_at).toLocaleString()}` : ''}
          {demo && <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-600 border border-emerald-300 rounded px-1">demo</span>}
        </p>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="h-1.5 bg-[#2CA01C]" />
        <div className="p-6">
          <div className="flex justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xl font-bold text-slate-900">{TRANE.legalName}</div>
              <div className="text-sm text-gray-600 mt-1 leading-5">
                {TRANE.address}<br />{TRANE.phone}<br />{TRANE.website}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-light tracking-wide text-[#2CA01C]">INVOICE</div>
              <div className="text-sm text-gray-600 mt-1"># {invoiceNumber(inv)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 text-sm">
            <div className="col-span-2">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">Bill to</div>
              <div className="font-medium">{cust?.name}</div>
              {cust?.address && <div className="text-gray-600">{cust.address}</div>}
              {cust?.email && <div className="text-gray-600">{cust.email}</div>}
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500">Date</div>
              <div>{fmt(date)}</div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500 mt-2">Terms</div>
              <div>Net 30</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gray-500">Due date</div>
              <div>{fmt(due)}</div>
            </div>
          </div>

          <table className="w-full text-sm mt-6">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="py-2 font-medium">Service</th>
                <th className="py-2 font-medium text-right">Qty</th>
                <th className="py-2 font-medium text-right">Rate</th>
                <th className="py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l) => (
                <tr key={l.service_id} className="border-b border-gray-100 align-top">
                  <td className="py-2.5 pr-2">
                    <div className="font-medium">{l.name}</div>
                    <div className="text-xs text-gray-500">{l.description.replace(/^[^—]*— /, '')}</div>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{l.qty}</td>
                  <td className="py-2.5 text-right tabular-nums">{money(l.rate)}</td>
                  <td className="py-2.5 text-right tabular-nums">{money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end mt-4">
            <div className="w-56 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="tabular-nums">{money(Number(inv.total))}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Tax</span><span className="tabular-nums">$0.00</span></div>
              <div className="flex justify-between font-semibold text-base border-t border-gray-200 pt-1"><span>Balance due</span><span className="tabular-nums">{money(Number(inv.total))}</span></div>
            </div>
          </div>

          <button type="button" onClick={() => alert('Demo — online payment turns on when QuickBooks is connected in the real app.')}
            className="mt-6 w-full sm:w-auto px-8 py-3 rounded-full bg-[#2CA01C] text-white font-semibold">
            Review and pay
          </button>
          <p className="text-xs text-gray-500 mt-4">Thank you for your business. — Trane Engineering</p>
        </div>
      </div>
    </div>
  );
}
