import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import NavBar from '@/components/NavBar';
import { type Role } from '@/lib/feature-catalog';

// The Fleet tab: the One Glovebox fleet program in a frame that fills
// everything under the nav. No page padding — the frame is the page.

export default async function FleetLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', user.id)
    .single();
  if (!profile) redirect('/login');
  if (profile.role === 'customer') redirect('/no-access');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <NavBar role={profile.role as Role} email={profile.email} />
      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}
