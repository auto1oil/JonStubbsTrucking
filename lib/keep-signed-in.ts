// "Keep me signed in on this phone".
//
// Sign-ins are session-only by default: the auth cookies carry no lifetime,
// so they die with the browser and every fresh open signs in again. That is
// right for the office and admins on shared machines, and wrong for a
// driver who opens the app in gloves every morning. So a driver-side login
// may opt in: the login route sets this marker cookie (never for office or
// admin roles), and every place that writes the auth cookies — the browser
// client, the server client and the middleware — gives them a real lifetime
// while the marker is present. Signing out clears it.

export const KEEP_COOKIE = 'jst-keep';
export const KEEP_MAX_AGE = 30 * 24 * 3600; // 30 days, then they sign in again

// Roles whose logins may stay signed in on a phone. Everyone else stays
// session-only whatever the box says.
export const KEEP_ALLOWED_ROLES = ['driver', 'labor', 'mechanic', 'hauler'];

// The cookie lifetime to apply, given whether the marker is present.
export function authCookieLifetime(keep: boolean): { maxAge: number | undefined; expires: Date | undefined } {
  return keep ? { maxAge: KEEP_MAX_AGE, expires: undefined } : { maxAge: undefined, expires: undefined };
}

// Read the marker from document.cookie (browser side only).
export function keepFromDocument(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((c) => c.trim().startsWith(`${KEEP_COOKIE}=1`));
}
