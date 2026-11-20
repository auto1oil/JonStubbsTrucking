import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import TestNav from '@/components/TestNav';
import SignOutButton from '@/components/SignOutButton';
import { BUSINESS } from '@/lib/test-time';
import { hasTestAccess } from '@/lib/test-auth';

// The Test tab: Trane Engineering, a trial business inside the app. Admins
// and logins marked as test users get in. It has its own header so it reads
// as its own business.

export default async function TestLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role, email, is_test_user').eq('id', user.id).single();
  if (!hasTestAccess(profile as { role?: string; is_test_user?: boolean } | null)) redirect('/');
  const staff = ['admin', 'master_admin', 'office', 'driver', 'mechanic', 'labor', 'hauler', 'contractor', 'funder'].includes(profile?.role || '');

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 pt-3 pb-1 flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-bold tracking-tight">{BUSINESS.name}</div>
            <div className="text-[11px] text-slate-300">{BUSINESS.tagline} · <span className="uppercase tracking-wide text-amber-300">test</span></div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {staff && <Link href="/" className="text-slate-300 hover:text-white">← Jon Stubbs</Link>}
            <span className="text-slate-400 hidden sm:inline">{profile?.email}</span>
            <SignOutButton className="text-slate-300 hover:text-white underline" />
          </div>
        </div>
        <TestNav />
      </header>
      <main className="max-w-3xl mx-auto px-4 py-4">{children}</main>
    </div>
  );
}
