// GET /api/cron/reminders — daily check for due reminders.
//
// Triggered by the Vercel Cron in vercel.json. For each active reminder whose
// date has arrived, creates an in-app notification (which the notifications
// trigger turns into a Web Push) for the owner, then advances recurring
// reminders to their next occurrence or marks one-time ones done.
// Secured by CRON_SECRET.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

type Reminder = {
  id: string;
  user_id: string;
  title: string;
  note: string | null;
  remind_on: string;
  repeat: 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  notify_in_app: boolean;
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Advance a date string to the next occurrence strictly after `today`.
function nextOccurrence(remindOn: string, repeat: Reminder['repeat'], today: string): string {
  const d = new Date(remindOn + 'T00:00:00');
  const todayD = new Date(today + 'T00:00:00');
  // Step forward until we're past today (handles a reminder that was missed
  // for several periods).
  let guard = 0;
  while (d <= todayD && guard < 1000) {
    if (repeat === 'daily') d.setDate(d.getDate() + 1);
    else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
    else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (repeat === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else break;
    guard++;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const db = createAdminClient();
  const today = todayISO();

  const { data: due } = await db
    .from('reminders')
    .select('id, user_id, title, note, remind_on, repeat, notify_in_app')
    .eq('active', true)
    .lte('remind_on', today)
    .or(`last_notified_on.is.null,last_notified_on.neq.${today}`);

  const reminders = (due as Reminder[]) || [];
  let fired = 0;

  for (const r of reminders) {
    if (r.notify_in_app) {
      await db.from('notifications').insert({
        recipient_id: r.user_id,
        kind: 'reminder',
        title: `Reminder: ${r.title}`,
        body: r.note || null,
        link: '/reminders',
      });
    }
    // Email delivery would go here once an email provider is configured.

    if (r.repeat === 'once') {
      await db.from('reminders').update({ active: false, last_notified_on: today }).eq('id', r.id);
    } else {
      await db
        .from('reminders')
        .update({ remind_on: nextOccurrence(r.remind_on, r.repeat, today), last_notified_on: today })
        .eq('id', r.id);
    }
    fired++;
  }

  // ---- Fleet: paperwork about to expire, maintenance coming due -----------
  // Once at 30, 14, 7 and 1 days out (and the day of), to the office and
  // admins, so a registration never lapses quietly.
  let fleet = 0;
  try {
    const { data: staff } = await db.from('profiles').select('id').in('role', ['office', 'admin', 'master_admin']);
    const ids = ((staff as { id: string }[]) || []).map((s) => s.id);
    const marks = new Set([30, 14, 7, 1, 0]);
    const daysTo = (iso: string) => Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86_400_000);
    const say = async (title: string, body: string, link: string) => {
      if (ids.length === 0) return;
      await db.from('notifications').insert(ids.map((id) => ({ recipient_id: id, kind: 'fleet_due', title, body, link })));
      fleet++;
    };
    const { data: docs } = await db.from('fleet_truck_documents')
      .select('truck_id, kind, expires_at, truck:fleet_trucks(unit_number)').not('expires_at', 'is', null);
    for (const d of (docs as unknown as { truck_id: string; kind: string; expires_at: string; truck: { unit_number: string } | null }[]) || []) {
      const n = daysTo(d.expires_at);
      if (marks.has(n)) await say(`Unit ${d.truck?.unit_number || '?'}: ${d.kind.replace(/_/g, ' ')} ${n === 0 ? 'expires today' : `expires in ${n} day${n === 1 ? '' : 's'}`}`, `Expires ${d.expires_at}.`, `/fleet/trucks/${d.truck_id}#documents`);
    }
    const { data: maint } = await db.from('fleet_maintenance')
      .select('truck_id, kind, next_due_at, truck:fleet_trucks(unit_number)').not('next_due_at', 'is', null);
    for (const m of (maint as unknown as { truck_id: string; kind: string; next_due_at: string; truck: { unit_number: string } | null }[]) || []) {
      const n = daysTo(m.next_due_at);
      if (marks.has(n)) await say(`Unit ${m.truck?.unit_number || '?'}: ${m.kind.replace(/_/g, ' ')} ${n === 0 ? 'due today' : `due in ${n} day${n === 1 ? '' : 's'}`}`, `Due ${m.next_due_at}.`, `/fleet/trucks/${m.truck_id}#maintenance`);
    }
  } catch { /* the reminders above already ran; the fleet nudge tries again tomorrow */ }

  return NextResponse.json({ ok: true, fired, fleet });
}
