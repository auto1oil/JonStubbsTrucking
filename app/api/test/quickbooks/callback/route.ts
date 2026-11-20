// GET /api/test/quickbooks/callback — Intuit sends the test company's
// consent back here. Saves the tokens to test_qb_connection.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireTestUser } from '@/lib/test-auth';
import { testExchangeCode } from '@/lib/test-qb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/test/invoices?qb=${q}`, url.origin));
  const auth = await requireTestUser();
  if (!auth.ok) return NextResponse.redirect(new URL('/login', url.origin));
  const state = url.searchParams.get('state');
  const saved = cookies().get('test_qb_state')?.value;
  cookies().delete('test_qb_state');
  if (!state || state !== saved) return back('state_mismatch');
  const code = url.searchParams.get('code');
  const realmId = url.searchParams.get('realmId');
  if (!code || !realmId) return back(encodeURIComponent(url.searchParams.get('error') || 'no_code'));
  try {
    await testExchangeCode(code, realmId);
    return back('connected');
  } catch (err) {
    return back(encodeURIComponent(err instanceof Error ? err.message.slice(0, 200) : 'token_exchange_failed'));
  }
}
