// POST /api/test/invoice — invoice a customer for all their finished,
// unbilled time: record it, create it in QuickBooks, email it.
// Body: { customer_id }.

import { NextResponse } from 'next/server';
import { requireTestUser } from '@/lib/test-auth';
import { createInvoiceForCustomer } from '@/lib/test-invoice';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await requireTestUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const body = (await req.json().catch(() => ({}))) as { customer_id?: string };
  if (!body.customer_id) return NextResponse.json({ ok: false, error: 'pick a customer' }, { status: 400 });
  const r = await createInvoiceForCustomer(body.customer_id, auth.userId);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  const { data } = await createAdminClient().from('test_invoices').select('*').eq('id', r.invoiceId!).single();
  return NextResponse.json({ ok: true, invoice: data });
}
