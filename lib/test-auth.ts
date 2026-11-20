import { createClient } from '@/lib/supabase-server';

// Who gets the Test tab: any login marked as a test user, plus every admin
// (admins see it without being marked). Mirrors public.is_test_user() in
// supabase-setup.sql, which is what RLS on the test_* tables uses.
export function hasTestAccess(profile: { role?: string | null; is_test_user?: boolean | null } | null | undefined): boolean {
  if (!profile) return false;
  return !!profile.is_test_user || profile.role === 'admin' || profile.role === 'master_admin';
}

// API routes call this first.
export type TestAuth = { ok: boolean; userId: string; isAdmin: boolean; status: number; error: string };

export async function requireTestUser(): Promise<TestAuth> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, userId: '', isAdmin: false, status: 401, error: 'not signed in' };
  const { data } = await supabase.from('profiles').select('role, is_test_user').eq('id', user.id).single();
  const profile = data as { role?: string; is_test_user?: boolean } | null;
  const isAdmin = profile?.role === 'admin' || profile?.role === 'master_admin';
  if (!hasTestAccess(profile)) return { ok: false, userId: user.id, isAdmin, status: 403, error: 'test users only' };
  return { ok: true, userId: user.id, isAdmin, status: 200, error: '' };
}
