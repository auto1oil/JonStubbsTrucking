// POST /api/fleet/trips/[id]/end — close a trip and work out its miles.
// Body: { odometer_end?, lat?, lng? }.
//
// Miles by state come from the breadcrumbs: each leg between two points
// is credited to the state the leg started in. The trip's total is the
// odometer difference when both readings are in (the phone undercounts
// whenever the app was in the background), and the state split is scaled
// to match; with no odometer the GPS total stands. A trip with no
// breadcrumbs at all is credited to the state of its last known point.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { stateAt } from '@/lib/us-states';
import { distanceM } from '@/lib/location-check';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { odometer_end?: number | null; lat?: number; lng?: number };

  const { data: tripRow } = await supabase
    .from('fleet_trips').select('*').eq('id', params.id).maybeSingle();
  if (!tripRow) return NextResponse.json({ ok: false, error: 'trip not found' }, { status: 404 });
  const trip = tripRow as { id: string; truck_id: string; status: string; odometer_start: number | null; start_lat: number | null; start_lng: number | null };
  if (trip.status !== 'active') return NextResponse.json({ ok: false, error: 'trip already ended' });

  const db = createAdminClient();
  const endLat = typeof body.lat === 'number' ? body.lat : null;
  const endLng = typeof body.lng === 'number' ? body.lng : null;
  if (endLat != null && endLng != null) {
    await db.from('fleet_trip_points').insert({ trip_id: trip.id, lat: endLat, lng: endLng, state: stateAt(endLat, endLng) });
  }

  const { data: pts } = await db
    .from('fleet_trip_points').select('at, lat, lng, state').eq('trip_id', trip.id).order('at');
  const points = (pts as { at: string; lat: number; lng: number; state: string | null }[]) || [];

  // Legs, credited to the state they started in. Legs that jump more than
  // 200 km are GPS glitches, not driving, and are skipped.
  const byState: Record<string, number> = {};
  let gpsMiles = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]; const b = points[i];
    const m = distanceM(Number(a.lat), Number(a.lng), Number(b.lat), Number(b.lng));
    if (m > 200_000) continue;
    const mi = m / 1609.34;
    gpsMiles += mi;
    const st = a.state || b.state || 'XX';
    byState[st] = (byState[st] || 0) + mi;
  }

  const odoEnd = typeof body.odometer_end === 'number' && Number.isFinite(body.odometer_end) ? Math.round(body.odometer_end) : null;
  const odoMiles = odoEnd != null && trip.odometer_start != null && odoEnd > trip.odometer_start ? odoEnd - trip.odometer_start : null;
  const total = odoMiles ?? Math.round(gpsMiles * 10) / 10;

  // Scale the split to the odometer; with no breadcrumbs, one state.
  let split: Record<string, number> = {};
  if (gpsMiles > 0) {
    const k = total / gpsMiles;
    for (const [st, mi] of Object.entries(byState)) split[st] = Math.round(mi * k * 10) / 10;
  } else if (total > 0) {
    const last = points[points.length - 1];
    const st = last?.state || (trip.start_lat != null && trip.start_lng != null ? stateAt(Number(trip.start_lat), Number(trip.start_lng)) : null) || 'XX';
    split = { [st]: total };
  }

  await db.from('fleet_trip_states').delete().eq('trip_id', trip.id);
  const rows = Object.entries(split).filter(([, mi]) => mi > 0).map(([state, miles]) => ({ trip_id: trip.id, state, miles }));
  if (rows.length) await db.from('fleet_trip_states').insert(rows);

  const { error } = await db.from('fleet_trips').update({
    status: 'ended', ended_at: new Date().toISOString(),
    odometer_end: odoEnd, end_lat: endLat, end_lng: endLng,
    miles: total, gps_miles: Math.round(gpsMiles * 10) / 10,
  }).eq('id', trip.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // The truck's latest reading, for maintenance due-by-miles.
  if (odoEnd != null) await db.from('fleet_trucks').update({ odometer: odoEnd }).eq('id', trip.truck_id);

  return NextResponse.json({ ok: true, miles: total, gps_miles: Math.round(gpsMiles * 10) / 10, states: split, points: points.length });
}
