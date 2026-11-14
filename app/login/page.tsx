'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { KEEP_COOKIE } from '@/lib/keep-signed-in';

// Everyone who uses this app is staff — crew, office, contractors, the funder,
// admins — so there's one sign-in form, plus the forgot-password path.
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState('');
  // "Keep me signed in on this phone" — on by default where there's a touch
  // screen, since that's a driver's phone far more often than an office PC.
  // The server only honours it for driver-side roles.
  const [keep, setKeep] = useState(false);
  useEffect(() => {
    try { setKeep(window.matchMedia('(pointer: coarse)').matches); } catch { /* leave off */ }
  }, []);

  // Email a password-reset link. It lands on /reset-password, which sets the
  // new password and drops them at their own home screen. If the email never
  // arrives, an admin can reset it from the Users page instead.
  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(''); setResetMsg('');
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setResetMsg('Check your email for a link to reset your password. If it doesn’t arrive, ask an admin to reset it for you.');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Record the sign-in before moving on — identity comes from the fresh
      // session cookie, and a failure here never blocks the login itself.
      // The same call sets the keep-signed-in marker when allowed; the auth
      // cookies were just written session-only, so refresh them once more
      // through a client that sees the marker and gives them a lifetime.
      try {
        const res = await fetch('/api/auth/login-event', {
          method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keep }),
        });
        const json = await res.json().catch(() => ({}));
        if (json.keep) await createClient().auth.refreshSession();
        else document.cookie = `${KEEP_COOKIE}=; Max-Age=0; path=/`;
      } catch { /* the sign-in stands either way */ }
      router.push('/');
      router.refresh();
    }
  }

  const input = 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-lg border border-gray-200 p-8">
        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/jst-logo.png"
            alt="Jon Stubbs Trucking"
            className="h-16 w-auto mx-auto mb-3"
          />
          <p className="text-sm text-gray-500">
            {mode === 'forgot' ? 'Reset password' : 'Sign in'}
          </p>
        </div>

        {mode === 'signin' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={input}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={input}
              />
            </div>
            <label className="flex items-center gap-3 text-sm text-gray-700 py-1">
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="h-5 w-5 rounded border-gray-300" />
              <span>
                Keep me signed in on this phone
                <span className="block text-[11px] text-gray-500">For drivers and hauling companies. Office and admin logins always sign in each time.</span>
              </span>
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 text-base bg-brand-700 text-white rounded-md hover:bg-brand-900 disabled:opacity-50 font-medium"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => { setMode('forgot'); setError(''); setResetMsg(''); }}
              className="block w-full text-xs text-center text-brand-700 hover:underline"
            >
              Forgot your password?
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <p className="text-xs text-gray-500">
              Enter your email and we’ll send you a link to reset your password.
            </p>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={input}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {resetMsg && <p className="text-sm text-green-700">{resetMsg}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-brand-700 text-white rounded-md hover:bg-brand-900 disabled:opacity-50 font-medium"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(''); setResetMsg(''); }}
              className="block w-full text-xs text-center text-gray-500 hover:underline"
            >
              ← Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
