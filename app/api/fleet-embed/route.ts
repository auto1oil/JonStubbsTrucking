// GET /api/fleet-embed — the One Glovebox frame address for this company.
// Any signed-in user may ask (drivers and haulers can't read app_settings
// themselves); the fleet ID is read with the service role.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { FLEET_ID_KEY, fleetEmbedUrl } from '@/lib/fleet-embed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const { data } = await createAdminClient()
    .from('app_settings').select('value').eq('key', FLEET_ID_KEY).maybeSingle();
  const fleetId = ((data as { value: string } | null)?.value || '').trim();
  if (!fleetId) return NextResponse.json({ ok: true, configured: false, url: null });
  return NextResponse.json({ ok: true, configured: true, url: fleetEmbedUrl(fleetId) });
}
