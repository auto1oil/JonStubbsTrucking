'use client';
import { useCallback, useEffect, useState } from 'react';

// Test users: who can get into the Test tab, and a form anyone in it can
// use to add another login. Admins see the tab automatically; only an admin
// can take it away from someone.

type Row = { id: string; email: string | null; full_name: string | null; role: string; is_test_user: boolean };
type Created = { email: string; password: string | null; temporary: boolean; existing: boolean };

export default function TestTeam() {
  const [users, setUsers] = useState<Row[]>([]);
  const [me, setMe] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Created | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/test/users', { cache: 'no-store' });
      const j = await r.json();
      if (j.ok) { setUsers(j.users); setMe(j.me); setIsAdmin(j.isAdmin); }
      else setError(j.error || 'Could not load test users.');
    } catch { setError('No signal — try again.'); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setCreated(null);
    try {
      const r = await fetch('/api/test/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, full_name: name, password }),
      });
      const j = await r.json();
      if (!j.ok) setError(j.error || 'Could not add that login.');
      else {
        setCreated({ email: j.email, password: j.password, temporary: !!j.temporary, existing: !!j.existing });
        setName(''); setEmail(''); setPassword('');
        load();
      }
    } catch { setError('No signal — try again.'); }
    setBusy(false);
  }

  async function remove(u: Row) {
    if (!confirm(`Take the Test tab away from ${u.email}?`)) return;
    const r = await fetch(`/api/test/users?id=${encodeURIComponent(u.id)}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({ ok: false }));
    if (!j.ok) alert(j.error || 'Could not remove.');
    load();
  }

  const signIn = typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login';
  const shareText = created?.password
    ? `Your Trane Engineering test login\nSign in: ${signIn}\nEmail: ${created.email}\nPassword: ${created.password}${created.temporary ? '\nYou’ll pick your own password the first time you sign in.' : ''}`
    : '';

  const testUsers = users.filter((u) => u.is_test_user);
  const admins = users.filter((u) => !u.is_test_user);

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
        <h2 className="font-semibold">Add a test user</h2>
        <p className="text-xs text-gray-500">They sign in at the normal Jon Stubbs page and land right here, in the Test tab only.</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Tony Trane)"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" required
          autoCapitalize="none" autoCorrect="off" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (leave blank for a temporary one)"
          autoCapitalize="none" autoCorrect="off" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg" />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button disabled={busy} className="w-full py-3 rounded-lg bg-slate-900 text-white font-semibold disabled:opacity-50">
          {busy ? 'Adding…' : 'Add test user'}
        </button>
      </form>

      {created && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm space-y-2">
          {created.existing ? (
            <p className="text-emerald-900">✓ {created.email} already had a login and now has the Test tab. They sign in with their usual password.</p>
          ) : (
            <>
              <p className="text-emerald-900 font-medium">✓ Login created for {created.email}</p>
              <div className="font-mono text-slate-800 bg-white border border-emerald-200 rounded-lg px-3 py-2">
                <div>Email: {created.email}</div>
                <div>Password: {created.password}</div>
              </div>
              {created.temporary && <p className="text-xs text-emerald-800">Temporary — they choose their own the first time they sign in.</p>}
              <div className="flex gap-3">
                <a href={`sms:?&body=${encodeURIComponent(shareText)}`} className="underline text-slate-700">Text it</a>
                <a href={`mailto:${created.email}?subject=${encodeURIComponent('Your Trane Engineering test login')}&body=${encodeURIComponent(shareText)}`} className="underline text-slate-700">Email it</a>
                <button type="button" onClick={() => navigator.clipboard?.writeText(shareText).catch(() => {})} className="underline text-slate-700">Copy</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h2 className="font-semibold mb-2">Test users</h2>
        {loading ? <p className="text-sm text-gray-500">Loading…</p> : testUsers.length === 0 ? <p className="text-sm text-gray-500">None yet.</p> : (
          <ul className="divide-y divide-gray-100">
            {testUsers.map((u) => (
              <li key={u.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{u.full_name && u.full_name !== u.email ? u.full_name : u.email}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {u.full_name && u.full_name !== u.email ? `${u.email} · ` : ''}{u.role === 'customer' ? 'Test tab only' : `also ${u.role.replace('_', ' ')}`}
                    {u.id === me ? ' · you' : ''}
                  </div>
                </div>
                {isAdmin && u.id !== me && (
                  <button onClick={() => remove(u)} className="text-xs underline text-gray-500 shrink-0">Remove</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {admins.length > 0 && (
          <p className="text-xs text-gray-500 mt-3">
            Admins see the Test tab automatically: {admins.map((a) => a.full_name && a.full_name !== a.email ? a.full_name : a.email).join(', ')}.
          </p>
        )}
      </div>
    </div>
  );
}
