// GET /api/work-orders/[id]/pins — the pit and job pins of the order this
// ticket is on, so the driver's stamp button can say "at the pit" the moment
// they tap. Haulers can't read the order book (it carries the customer
// rate), so the pins come through here: the ticket's own people and staff.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const { data: actor } = await supabase
    .from('profiles').select('role, hauler_id').eq('id', user.id).single();

  const db = createAdminClient();
  const { data: wo } = await db
    .from('work_orders').select('order_id, hauler_id, submitted_by, assigned_to')
    .eq('id', params.id).maybeSingle();
  if (!wo) return NextResponse.json({ ok: false, error: 'work order not found' }, { status: 404 });

  const row = wo as { order_id: string | null; hauler_id: string | null; submitted_by: string | null; assigned_to: string | null };
  const isStaff = ['office', 'admin', 'master_admin'].includes(actor?.role || '');
  const isTheirs = (!!actor?.hauler_id && actor.hauler_id === row.hauler_id)
    || row.submitted_by === user.id || row.assigned_to === user.id;
  if (!isStaff && !isTheirs) return NextResponse.json({ ok: false, error: 'not your ticket' }, { status: 403 });

  if (!row.order_id) return NextResponse.json({ ok: true, pins: null });
  const { data: o } = await db
    .from('job_orders').select('pit_lat, pit_lng, job_lat, job_lng, geo_radius_m')
    .eq('id', row.order_id).maybeSingle();
  return NextResponse.json({ ok: true, pins: o ?? null });
}
