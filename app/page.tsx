import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';

export default async function Home() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Logged-out visitors land on the public marketing Home.
  if (!user) redirect('/home');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_test_user')
    .eq('id', user.id)
    .single();

  // A plain sign-in given the Test tab goes straight to it.
  if (profile?.role === 'customer' && (profile as { is_test_user?: boolean }).is_test_user) redirect('/test');

  if (profile?.role === 'admin' || profile?.role === 'master_admin') redirect('/admin');
  if (profile?.role === 'contractor') redirect('/contractor');
  if (profile?.role === 'hauler') redirect('/hauler');
  if (profile?.role === 'funder') redirect('/funder');
  if (profile?.role === 'customer') redirect('/no-access');
  // Office reviews and invoices tickets. Labor is hourly staff, so their home
  // is the clock. Mechanics get the full driver experience (deliveries +
  // invoices), so they land on /driver.
  if (profile?.role === 'office') redirect('/work-orders');
  if (profile?.role === 'labor') redirect('/driver/hours');
  redirect('/driver');
}
