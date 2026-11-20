import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { authCookieLifetime, KEEP_COOKIE, KEEP_ALLOWED_ROLES } from '@/lib/keep-signed-in';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  // "Keep me signed in" marker — see lib/keep-signed-in.ts. Only a driver-
  // side role may carry it; a privileged login found with it loses it below.
  let keep = request.cookies.get(KEEP_COOKIE)?.value === '1';

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          // Session-only auth cookies — no lifetime, so the sign-in dies
          // with the browser/app — unless this phone opted to stay signed in.
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, { ...options, ...authCookieLifetime(keep) })
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  // Everything behind the sign-in. /home, /login, /reset-password, /no-access
  // and the legal pages stay public.
  //
  // '/hauler' covers '/haulers' too. Both have to be here: this list is what
  // forces the first-login password change, so a path missing from it leaves
  // those people on their temporary password indefinitely.
  const isEmployeePath = path.startsWith('/admin') || path.startsWith('/driver') || path.startsWith('/tickets') || path.startsWith('/work-orders') || path.startsWith('/contractor') || path.startsWith('/funder') || path.startsWith('/hauler') || path.startsWith('/settings') || path.startsWith('/tasks') || path.startsWith('/reminders') || path.startsWith('/messages') || path.startsWith('/fleet') || path.startsWith('/test');

  if (isEmployeePath && !user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (path === '/login' && user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Force password change on first login — employees only. Customers set
  // their own password at signup so they're never in this state. The same
  // read checks that a "keep me signed in" marker belongs to a driver-side
  // role; on anyone else it is removed and the auth cookies go back to
  // session-only on their next refresh.
  //
  // A test-only login (a plain sign-in an admin marked as a test user, with
  // no staff role) is kept inside the Test tab: any other page sends it
  // back there. API calls, files (anything with an extension) and the
  // sign-in/password pages are left alone.
  const isPage = !path.startsWith('/api') && !/\.[a-z0-9]+$/i.test(path);
  const testAllowed = path.startsWith('/test') || path === '/login' || path === '/reset-password' || path === '/account' || path.startsWith('/legal');
  if (user && (isEmployeePath || keep || (isPage && !testAllowed))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('must_change_password, role, is_test_user')
      .eq('id', user.id)
      .single();
    if (keep && !KEEP_ALLOWED_ROLES.includes(profile?.role || '')) {
      keep = false;
      response.cookies.set(KEEP_COOKIE, '', { maxAge: 0, path: '/' });
    }
    if (isEmployeePath && profile?.must_change_password && path !== '/account') {
      return NextResponse.redirect(new URL('/account', request.url));
    }
    const testOnly = profile?.role === 'customer' && !!(profile as { is_test_user?: boolean }).is_test_user;
    if (testOnly && isPage && !testAllowed) {
      return NextResponse.redirect(new URL('/test', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
