'use client';
import { createBrowserClient } from '@supabase/ssr';
import { authCookieLifetime, keepFromDocument } from '@/lib/keep-signed-in';

// Session-only auth by default: no Max-Age on the auth cookies, so they die
// with the browser/app and every fresh open is a fresh sign-in. A driver who
// chose "keep me signed in" carries a marker cookie (set server-side, roles
// permitting), and then the cookies get a real lifetime. The middleware and
// server client apply the same rule — all three writers must agree or a
// refresh would quietly flip it.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: authCookieLifetime(keepFromDocument()) }
  );
}
