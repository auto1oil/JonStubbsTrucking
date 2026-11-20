// /api/test/users — who has the Test tab, and adding more.
//
// GET    anyone with Test access: the list of test-user logins.
// POST   anyone with Test access: create a new test-only login
//        { email, full_name?, password? }. With no password a temporary one
//        is made and they choose their own on first sign-in. An email that
//        already has an account is only turned on by an admin, so a test
//        user can't push a real customer's login into the Test tab.
// DELETE admins only: ?id= takes the Test tab away from a login.
//
// The service-role client does the writes: is_test_user is guarded so the
// browser can't set it.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireTestUser } from '@/lib/test-auth';

export const runtime = 'nodejs';

type Row = { id: string; email: string | null; full_name: string | null; role: string; is_test_user: boolean; created_at?: string };

function tempPassword(): string {
  return `Trane-${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET() {
  const auth = await requireTestUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('id, email, full_name, role, is_test_user, created_at')
    .or('is_test_user.eq.true,role.eq.admin,role.eq.master_admin')
    .order('email');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, users: (data as Row[]) || [], me: auth.userId, isAdmin: auth.isAdmin });
}

export async function POST(req: Request) {
  const auth = await requireTestUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body: { email?: string; full_name?: string; password?: string };
  try { body = await req.json(); } catch { body = {}; }
  const email = (body.email || '').trim().toLowerCase();
  const full_name = (body.full_name || '').trim();
  const chosen = (body.password || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Enter a valid email.' }, { status: 400 });
  }
  if (chosen && chosen.length < 6) {
    return NextResponse.json({ ok: false, error: 'The password needs at least 6 characters.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Already has a login? Admins can switch the Test tab on for it; anyone
  // else is told to ask an admin (unless it's already a test user).
  const { data: existing } = await admin.from('profiles').select('id, role, is_test_user').eq('email', email).maybeSingle();
  if (existing) {
    const ex = existing as { id: string; role: string; is_test_user: boolean };
    if (ex.is_test_user) return NextResponse.json({ ok: true, email, existing: true, password: null });
    if (!auth.isAdmin) {
      return NextResponse.json({ ok: false, error: 'That email already has a login. Ask an admin to give it the Test tab.' }, { status: 400 });
    }
    const { error } = await admin.from('profiles').update({ is_test_user: true }).eq('id', ex.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, email, existing: true, password: null });
  }

  const password = chosen || tempPassword();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: full_name ? { full_name } : undefined,
  });
  if (error || !created?.user) {
    const msg = /already.*registered|exists/i.test(error?.message || '') ? 'That email already has an account.' : (error?.message || 'Could not create the login.');
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  // The new-user trigger made a plain 'customer' profile; a customer marked
  // as a test user only ever sees the Test tab.
  const { error: upErr } = await admin
    .from('profiles')
    .update({ is_test_user: true, full_name: full_name || email, must_change_password: !chosen })
    .eq('id', created.user.id);
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, email, existing: false, password, temporary: !chosen });
}

export async function DELETE(req: Request) {
  const auth = await requireTestUser();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!auth.isAdmin) return NextResponse.json({ ok: false, error: 'Only an admin can remove a test user.' }, { status: 403 });
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!id) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 });
  if (id === auth.userId) return NextResponse.json({ ok: false, error: 'You can’t remove yourself.' }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin.from('profiles').update({ is_test_user: false }).eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
