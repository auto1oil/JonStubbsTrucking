// Turning Trane Engineering's clocked time into an invoice, and getting it
// to the customer through QuickBooks. Server-side only (service role).
//
// The invoice is recorded here first and the time entries are attached to
// it, so a QuickBooks hiccup can never bill the same hours twice: the
// invoice just shows "failed" with the reason and a Retry button, and the
// retry re-uses the same lines.

import { createAdminClient } from '@/lib/supabase-admin';
import { buildLines, linesTotal, type TestCustomer, type TestEntry, type TestInvoice, type TestService } from '@/lib/test-time';
import { ensureQbCustomer, ensureQbItem, createQbInvoice, emailQbInvoice, testQbStatus } from '@/lib/test-qb';

export async function createInvoiceForCustomer(customerId: string, userId: string): Promise<{ ok: boolean; invoiceId?: string; error?: string }> {
  const db = createAdminClient();
  const [{ data: ents }, { data: svcs }] = await Promise.all([
    db.from('test_time_entries').select('*').eq('customer_id', customerId).is('invoice_id', null).not('clock_out_at', 'is', null),
    db.from('test_services').select('*'),
  ]);
  const entries = (ents as TestEntry[]) || [];
  if (entries.length === 0) return { ok: false, error: 'No finished time to invoice for this customer.' };
  const lines = buildLines(entries, (svcs as TestService[]) || []);
  const total = linesTotal(lines);
  if (total <= 0) return { ok: false, error: 'Nothing to bill — the time adds up to zero.' };

  const { data: inv, error } = await db.from('test_invoices')
    .insert({ customer_id: customerId, lines, total, status: 'draft', created_by: userId })
    .select('id').single();
  if (error || !inv) return { ok: false, error: error?.message || 'Could not record the invoice.' };
  const invoiceId = (inv as { id: string }).id;
  // Claim the entries; only ones still unbilled are taken.
  await db.from('test_time_entries').update({ invoice_id: invoiceId }).in('id', entries.map((e) => e.id)).is('invoice_id', null);

  // QuickBooks comes later. Until Trane's company is connected the invoice
  // is complete here, and the screen offers to email it from the phone.
  if ((await testQbStatus()).connected) await deliverInvoice(invoiceId);
  return { ok: true, invoiceId };
}

// Create the QuickBooks invoice (once) and email it. Safe to call again.
export async function deliverInvoice(invoiceId: string): Promise<{ ok: boolean; status: string; error?: string }> {
  const db = createAdminClient();
  const { data: row } = await db.from('test_invoices').select('*').eq('id', invoiceId).maybeSingle();
  const inv = row as TestInvoice | null;
  if (!inv) return { ok: false, status: 'missing', error: 'invoice not found' };
  const { data: c } = await db.from('test_customers').select('*').eq('id', inv.customer_id).maybeSingle();
  const cust = c as TestCustomer | null;
  if (!cust) return { ok: false, status: 'failed', error: 'customer not found' };

  const fail = async (msg: string) => {
    await db.from('test_invoices').update({ status: 'failed', error: msg }).eq('id', invoiceId);
    return { ok: false, status: 'failed', error: msg };
  };

  try {
    let qbInvoiceId = inv.qb_invoice_id;
    if (!qbInvoiceId) {
      const customerQbId = cust.qb_customer_id || await ensureQbCustomer(cust);
      if (!cust.qb_customer_id) await db.from('test_customers').update({ qb_customer_id: customerQbId }).eq('id', cust.id);

      const { data: svcs } = await db.from('test_services').select('*');
      const services = (svcs as TestService[]) || [];
      const lines = [];
      for (const l of inv.lines) {
        const svc = services.find((s) => s.id === l.service_id);
        const itemId = svc?.qb_item_id || await ensureQbItem({ name: l.name, rate: l.rate });
        if (svc && !svc.qb_item_id) await db.from('test_services').update({ qb_item_id: itemId }).eq('id', svc.id);
        lines.push({ itemId, name: l.name, qty: l.qty, rate: l.rate, amount: l.amount, description: l.description });
      }
      const created = await createQbInvoice({ customerId: customerQbId, email: cust.email, lines });
      qbInvoiceId = created.Id;
      await db.from('test_invoices').update({ status: 'invoiced', qb_invoice_id: created.Id, qb_doc_number: created.DocNumber ?? null, error: null }).eq('id', invoiceId);
    }

    if (!cust.email) {
      await db.from('test_invoices').update({ status: 'invoiced', error: 'Invoice is in QuickBooks, but the customer has no email address — add one on the Customers tab and press Retry to email it.' }).eq('id', invoiceId);
      return { ok: true, status: 'invoiced' };
    }
    await emailQbInvoice(qbInvoiceId, cust.email);
    await db.from('test_invoices').update({ status: 'sent', emailed_to: cust.email, sent_at: new Date().toISOString(), error: null }).eq('id', invoiceId);
    return { ok: true, status: 'sent' };
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'QuickBooks failed');
  }
}
