// GET /api/test/quickbooks/authorize — connect Trane Engineering's own
// QuickBooks company (a sandbox by default). Test users only.

import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireTestUser } from '@/lib/test-auth';
import { testAuthorizeUrl, testQbConfigured } from '@/lib/test-qb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const auth = await requireTestUser();
  if (!auth.ok) return NextResponse.redirect(new URL('/login', origin));
  if (!testQbConfigured()) return NextResponse.redirect(new URL('/test/invoices?qb=not_configured', origin));
  const state = crypto.randomBytes(16).toString('hex');
  cookies().set('test_qb_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return NextResponse.redirect(testAuthorizeUrl(state));
}
