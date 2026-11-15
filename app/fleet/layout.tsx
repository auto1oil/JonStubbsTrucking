import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import NavBar from '@/components/NavBar';
import FleetNav from '@/components/FleetNav';
import { type Role } from '@/lib/feature-catalog';

// The fleet program: trucks, trips and IFTA miles, fuel, receipts,
// maintenance, repairs and documents. Everyone who drives or dispatches
// gets it; what they see is their own company's fleet.

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
  if (profile.role === 'customer' || profile.role === 'funder' || profile.role === 'contractor') redirect('/no-access');

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar role={profile.role as Role} email={profile.email} />
      <main className="max-w-5xl mx-auto px-4 py-4">
        <FleetNav />
        {children}
      </main>
    </div>
  );
}
