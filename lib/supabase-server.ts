import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { authCookieLifetime, KEEP_COOKIE } from '@/lib/keep-signed-in';

export function createClient() {
  const cookieStore = cookies();
  const keep = cookieStore.get(KEEP_COOKIE)?.value === '1';
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            // Session-only auth cookies unless this phone opted to stay
            // signed in (see lib/keep-signed-in.ts).
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { ...options, ...authCookieLifetime(keep) })
            );
          } catch { /* server component, ignore */ }
        },
      },
    }
  );
}
