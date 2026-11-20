import { createClient } from '@/lib/supabase-server';

// The Test tab is for logins an admin has marked as test users, whatever
// their role. API routes call this first.
export type TestAuth = { ok: boolean; userId: string; status: number; error: string };

export async function requireTestUser(): Promise<TestAuth> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, userId: '', status: 401, error: 'not signed in' };
  const { data } = await supabase.from('profiles').select('is_test_user').eq('id', user.id).single();
  if (!(data as { is_test_user?: boolean } | null)?.is_test_user) return { ok: false, userId: user.id, status: 403, error: 'test users only' };
  return { ok: true, userId: user.id, status: 200, error: '' };
}
