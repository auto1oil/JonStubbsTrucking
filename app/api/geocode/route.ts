// GET /api/geocode?q=<address> — turn a typed address into a pin for the
// order form. Staff only. Uses OpenStreetMap's Nominatim, which asks for a
// real contact in the User-Agent and no more than a request a second — an
// order is pinned once, so that is plenty. A pit called "Harmony PH2" won't
// be found here; the office drops that pin on the map instead.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!me || !['office', 'admin', 'master_admin'].includes(me.role)) {
    return NextResponse.json({ ok: false, error: 'office only' }, { status: 403 });
  }

  const q = (new URL(req.url).searchParams.get('q') || '').trim();
  if (q.length < 4) return NextResponse.json({ ok: false, error: 'type an address first' }, { status: 400 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'JonStubbsTrucking/1.0 (jonstubbstruckingllc@gmail.com)', Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return NextResponse.json({ ok: false, error: `the map service answered ${res.status}` }, { status: 502 });
    const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    const hit = rows[0];
    if (!hit) return NextResponse.json({ ok: false, error: 'no match for that address — drop the pin on the map instead' });
    return NextResponse.json({
      ok: true,
      lat: Number(parseFloat(hit.lat).toFixed(6)),
      lng: Number(parseFloat(hit.lon).toFixed(6)),
      display: hit.display_name,
    });
  } catch (err) {
    const why = err instanceof Error && err.name === 'AbortError' ? 'the map service timed out' : 'could not reach the map service';
    return NextResponse.json({ ok: false, error: why }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
