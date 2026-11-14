// POST /api/auth/login-event — record a successful sign-in, and honour
// "keep me signed in on this phone" for the roles allowed to.
//
// Called by the login page the moment signInWithPassword succeeds. Identity
// comes from the session, never the request body; the address and device
// come from the request itself. Writes with the service role — the table has
// no insert policy for browsers, so a trail can't be forged or scrubbed from
// one.
//
// Body: { keep?: boolean }. The marker cookie is set only for driver-side
// roles (lib/keep-signed-in.ts); office and admin logins never get it,
// whatever the box said.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { KEEP_COOKIE, KEEP_MAX_AGE, KEEP_ALLOWED_ROLES } from '@/lib/keep-signed-in';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { keep?: boolean };
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const keep = body.keep === true && KEEP_ALLOWED_ROLES.includes(me?.role || '');

  // First hop of x-forwarded-for is the client on Vercel.
  const fwd = req.headers.get('x-forwarded-for') || '';
  const ip = (fwd.split(',')[0] || req.headers.get('x-real-ip') || '').trim() || null;
  const ua = (req.headers.get('user-agent') || '').slice(0, 300) || null;

  try {
    await createAdminClient().from('login_events').insert({
      user_id: user.id,
      email: user.email ?? null,
      ip,
      user_agent: ua,
    });
  } catch { /* the sign-in itself must never fail over its own logbook */ }

  const res = NextResponse.json({ ok: true, keep });
  if (keep) {
    res.cookies.set(KEEP_COOKIE, '1', { maxAge: KEEP_MAX_AGE, path: '/', sameSite: 'lax', secure: true });
  } else {
    res.cookies.set(KEEP_COOKIE, '', { maxAge: 0, path: '/' });
  }
  return res;
}
