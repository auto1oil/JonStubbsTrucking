// POST /api/work-orders/[id]/progress — push this ticket's current state to
// the funding app as in-progress. Called by the ticket form after a save and
// by the load lines after a stamp; fire-and-forget on the client side.
//
// The server decides whether anything goes: only an open ticket belonging to
// a hauler whose Auto 1 Funding link is active is sent, and the API key lives
// here, never in the browser. The hauler's own people and the office may ask.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { sendTicketProgress } from '@/lib/factoring';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });

  const { data: actor } = await supabase
    .from('profiles').select('role, hauler_id').eq('id', user.id).single();

  const db = createAdminClient();
  const { data: wo } = await db
    .from('work_orders').select('id, hauler_id').eq('id', params.id).maybeSingle();
  if (!wo) return NextResponse.json({ ok: false, error: 'work order not found' }, { status: 404 });

  const row = wo as { hauler_id: string | null };
  const isStaff = ['office', 'admin', 'master_admin'].includes(actor?.role || '');
  const isTheirs = !!actor?.hauler_id && actor.hauler_id === row.hauler_id;
  if (!isStaff && !isTheirs) {
    return NextResponse.json({ ok: false, error: 'not your ticket' }, { status: 403 });
  }

  const result = await sendTicketProgress(db, params.id);
  return NextResponse.json(result);
}
