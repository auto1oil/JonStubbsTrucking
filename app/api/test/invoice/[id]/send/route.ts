// POST /api/test/invoice/[id]/send — retry getting an invoice into
// QuickBooks and emailed (after connecting QuickBooks, or adding an email).

import { NextResponse } from 'next/server';
import { requireTestUser } from '@/lib/test-auth';
import { deliverInvoice } from '@/lib/test-invoice';
import { testQbStatus } from '@/lib/test-qb';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireTestUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!(await testQbStatus()).connected) return NextResponse.json({ ok: false, error: 'QuickBooks isn\u2019t connected for Trane yet.' }, { status: 400 });
  await deliverInvoice(params.id);
  const { data } = await createAdminClient().from('test_invoices').select('*').eq('id', params.id).single();
  return NextResponse.json({ ok: true, invoice: data });
}
