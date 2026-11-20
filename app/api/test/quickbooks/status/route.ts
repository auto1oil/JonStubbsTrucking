// GET /api/test/quickbooks/status — is Trane's QuickBooks company connected?

import { NextResponse } from 'next/server';
import { requireTestUser } from '@/lib/test-auth';
import { testQbStatus, testQbConfigured, testRedirectUri } from '@/lib/test-qb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireTestUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const s = await testQbStatus();
  return NextResponse.json({ ok: true, ...s, configured: testQbConfigured(), redirect_uri: testRedirectUri() });
}
