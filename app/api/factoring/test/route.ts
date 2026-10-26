// POST /api/factoring/test — the "Test connection" button on Work Orders →
// Setup. Admin only. Reads the SAVED endpoint and key server-side (the key
// never reaches the browser) and asks the funding app's link-status endpoint
// a harmless question. Creates nothing over there.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { testFactoringConnection } from '@/lib/factoring';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: 'not signed in' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!me || !['admin', 'master_admin'].includes(me.role)) {
    return NextResponse.json({ ok: false, message: 'admin only' }, { status: 403 });
  }

  const result = await testFactoringConnection(createAdminClient());
  return NextResponse.json(result);
}
