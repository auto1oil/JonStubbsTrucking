// POST /api/fleet/trips/[id]/ping — a GPS breadcrumb while a trip runs.
// Body: { lat, lng, accuracy? }. The state is worked out here from bundled
// state outlines, so every point carries it and the IFTA split needs no
// map service. The trip must be active and the caller's own (or staff).

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { stateAt } from '@/lib/us-states';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { lat?: number; lng?: number; accuracy?: number };
  if (typeof body.lat !== 'number' || typeof body.lng !== 'number') {
    return NextResponse.json({ ok: false, error: 'no coordinates' }, { status: 400 });
  }

  // The caller's own view decides whether the trip is theirs at all (RLS).
  const { data: trip } = await supabase
    .from('fleet_trips').select('id, status').eq('id', params.id).maybeSingle();
  if (!trip) return NextResponse.json({ ok: false, error: 'trip not found' }, { status: 404 });
  if ((trip as { status: string }).status !== 'active') return NextResponse.json({ ok: false, error: 'trip has ended' });

  const state = stateAt(body.lat, body.lng);
  const { error } = await createAdminClient().from('fleet_trip_points').insert({
    trip_id: params.id, lat: body.lat, lng: body.lng,
    accuracy_m: typeof body.accuracy === 'number' ? body.accuracy : null, state,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, state });
}
