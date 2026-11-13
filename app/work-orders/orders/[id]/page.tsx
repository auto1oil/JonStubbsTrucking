'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import OrderForm from '@/components/OrderForm';
import AddressLink from '@/components/AddressLink';
import {
  ORDER_STATUS_LABEL, ORDER_STATUS_TONE, orderSpan, type JobOrder,
} from '@/lib/job-orders';
import { LOAD_STATUS_LABEL, LOAD_STATUS_TONE, type HaulerLoad, type LoadStatus } from '@/lib/haulers';
import {
  STATUS_LABEL, STATUS_TONE, ticketAmount, totalHours,
  type WorkOrder, type WorkOrderStatus,
} from '@/lib/work-orders';

// One order: the agreed terms, every ticket filed against it, and anything on
// those tickets that disagrees with what was agreed.

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const [order, setOrder] = useState<JobOrder | null>(null);
  const [tickets, setTickets] = useState<WorkOrder[]>([]);
  const [customer, setCustomer] = useState<string | null>(null);
  // The trucks dispatched against this order, with who they went to.
  const [loads, setLoads] = useState<HaulerLoad[]>([]);
  const [haulerNames, setHaulerNames] = useState<Record<string, string>>({});
  const [driverNames, setDriverNames] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const refresh = useCallback(async () => {
    const { data: o } = await supabase
      .from('job_orders').select('*').eq('id', params.id).maybeSingle();
    if (!o) { setError('That order no longer exists.'); return; }
    setOrder(o as JobOrder);

    const [{ data: t }, { data: biz }, { data: l }] = await Promise.all([
      supabase.from('work_orders').select('*').eq('order_id', params.id)
        .order('job_date', { ascending: false, nullsFirst: false }),
      (o as JobOrder).business_id
        ? supabase.from('businesses').select('name').eq('id', (o as JobOrder).business_id!).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('hauler_loads').select('*').eq('order_id', params.id)
        .order('job_date', { ascending: false, nullsFirst: false }),
    ]);
    setTickets((t as WorkOrder[]) || []);
    setCustomer((biz as { name: string } | null)?.name ?? null);
    const rows = (l as HaulerLoad[]) || [];
    setLoads(rows);
    const haulerIds = Array.from(new Set(rows.map((r) => r.hauler_id)));
    const driverIds = Array.from(new Set(rows.map((r) => r.driver_id).filter(Boolean))) as string[];
    const [{ data: hs }, { data: ds }] = await Promise.all([
      haulerIds.length ? supabase.from('haulers').select('id, name').in('id', haulerIds) : Promise.resolve({ data: [] }),
      driverIds.length ? supabase.from('profiles').select('id, full_name, email').in('id', driverIds) : Promise.resolve({ data: [] }),
    ]);
    setHaulerNames(Object.fromEntries(((hs as { id: string; name: string }[]) || []).map((h) => [h.id, h.name])));
    setDriverNames(Object.fromEntries(((ds as { id: string; full_name: string | null; email: string }[]) || []).map((d) => [d.id, d.full_name || d.email])));
  }, [supabase, params.id]);

  useEffect(() => { refresh(); }, [refresh]);

  // Clearing a flag is the office saying "I looked, it's fine" — so it records
  // who and when rather than just wiping the note.
  async function clearFlag(t: WorkOrder) {
    setBusy(t.id); setError('');
    const { data: { user } } = await supabase.auth.getUser();
    const { error: err } = await supabase.from('work_orders').update({
      mismatch_cleared_by: user?.id ?? null,
      mismatch_cleared_at: new Date().toISOString(),
    }).eq('id', t.id);
    setBusy('');
    if (err) { setError(err.message); return; }
    refresh();
  }

  const card = 'bg-white border border-gray-200 rounded-lg p-4';

  if (error && !order) return <p className="text-sm text-red-600">{error}</p>;
  if (!order) return <p className="text-sm text-gray-500">Loading…</p>;

  if (editing) {
    return (
      <div>
        <button onClick={() => setEditing(false)} className="text-sm text-brand-700 hover:underline">
          ← Back to the order
        </button>
        <h1 className="text-2xl font-semibold mt-2 mb-4">Edit order #{order.order_number}</h1>
        <OrderForm order={order} />
      </div>
    );
  }

  const flagged = tickets.filter((t) => t.order_mismatch && !t.mismatch_cleared_at);
  const billed = tickets.reduce((n, t) => n + ticketAmount(t), 0);
  const hours = tickets.reduce((n, t) => n + totalHours(t), 0);
  const tons = tickets.reduce((n, t) => n + Number(t.loads_tons || 0), 0);

  // Every field on the order, grouped the way the office reads it. Blank
  // fields are left out so the card only says what was agreed.
  const per = order.rate_unit || 'hour';
  const money = (n: number | null) => (n != null ? `$${Number(n).toFixed(2)}` : null);
  const hrs = (n: number | null) => (n != null ? `${Number(n).toFixed(2)} hrs` : null);
  const groups: [string, [string, React.ReactNode][]][] = [
    ['The job', [
      ['Customer', customer],
      ['Contractor / customer #', order.customer_number],
      ['Job #', order.job_number],
      ['Job name', order.job_name],
      ['Phase', order.phase_code],
      ['FSR', order.fsr],
      ['Material', order.material],
      ['Tonnage', order.tonnage != null ? `${Number(order.tonnage).toFixed(2)} ${order.tonnage_type || 'tons'}`.trim() : null],
      ['Equipment', order.equipment_type],
      ['Unit #', order.unit_number],
    ]],
    ['Where', [
      ['Load address (pit)', <AddressLink key="pit" address={order.pit_address} />],
      ['Unload address (job)', <AddressLink key="job" address={order.job_address} />],
      ['Location check', (() => {
        const pit = order.pit_lat != null && order.pit_lng != null;
        const job = order.job_lat != null && order.job_lng != null;
        const r = order.geo_radius_m || 800;
        if (pit && job) return `On — every stamp must land within ${r} m of the pit or the job pin.`;
        if (pit || job) return `Partly on — only the ${pit ? 'pit' : 'job'} is pinned. Pin the other end with Edit so every stamp is checked.`;
        return 'Off — neither end is pinned. Edit the order and pin the pit and the job, or tickets on it will be flagged in the audit.';
      })()],
    ]],
    ['When', [
      ['Runs', orderSpan(order)],
      ['Daily start', order.start_time],
      ['Daily stop', order.stop_time],
      ['Travel allowed', hrs(order.travel_hours)],
      ['Down time allowed', hrs(order.down_hours)],
    ]],
    ['Money', [
      ['Customer rate', money(order.rate) ? `${money(order.rate)} per ${per}` : null],
      ['Hauler pay rate', money(order.pay_rate) ? `${money(order.pay_rate)} per ${per}` : null],
      ['Margin', order.rate != null && order.pay_rate != null ? `${money(Number(order.rate) - Number(order.pay_rate))} per ${per}` : null],
      ['Fuel surcharge', money(order.fuel_surcharge)],
    ]],
  ];

  return (
    <div className="space-y-4">
      <Link href="/work-orders/orders" className="text-sm text-brand-700 hover:underline">← Orders</Link>

      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold">
          #{order.order_number}
          {order.job_name ? ` · ${order.job_name}` : ''}
        </h1>
        <div className="flex items-center gap-3">
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ORDER_STATUS_TONE[order.status]}`}>
            {ORDER_STATUS_LABEL[order.status]}
          </span>
          <button onClick={() => setEditing(true)} className="text-sm text-brand-700 hover:underline">Edit</button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {flagged.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <strong>{flagged.length}</strong> {flagged.length === 1 ? 'ticket doesn' : 'tickets don'}&apos;t
          match this order. They&apos;re marked below — check each one before it&apos;s billed.
        </div>
      )}

      <div className={card}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">Agreed</h2>
        <div className="space-y-4">
          {groups.map(([title, rows]) => {
            const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
            if (shown.length === 0) return null;
            return (
              <div key={title}>
                <h3 className="text-xs font-semibold text-gray-700 mb-1.5">{title}</h3>
                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                  {shown.map(([k, v]) => (
                    <div key={k} className={title === 'Where' ? 'col-span-2 sm:col-span-3' : ''}>
                      <dt className="text-xs text-gray-500">{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
          <div>
            <h3 className="text-xs font-semibold text-gray-700 mb-1.5">Job notes</h3>
            {order.notes ? (
              <p className="text-sm text-gray-800 whitespace-pre-wrap rounded-md bg-amber-50 border border-amber-200 px-3 py-2">{order.notes}</p>
            ) : (
              <p className="text-sm text-gray-400">None — add them with Edit.</p>
            )}
          </div>
          <p className="text-[11px] text-gray-400">
            Order #{order.order_number} · created {new Date(order.created_at).toLocaleDateString()}
            {order.updated_at !== order.created_at ? ` · updated ${new Date(order.updated_at).toLocaleString()}` : ''}
          </p>
        </div>
      </div>

      <div className={card}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
          Trucks sent on this order
        </h2>
        {loads.length === 0 ? (
          <p className="text-sm text-gray-500">
            No loads dispatched yet. Use the Send pill on the Orders list to send trucks to a hauler.
          </p>
        ) : (
          <div className="space-y-2">
            {loads.map((l) => (
              <div key={l.id} className="border border-gray-200 rounded-md px-3 py-2 flex justify-between items-start gap-3 flex-wrap">
                <div className="min-w-0 text-sm">
                  <div className="font-medium">
                    {haulerNames[l.hauler_id] || 'Hauler'}
                    {l.driver_id ? ` · ${driverNames[l.driver_id] || 'driver'}` : ''}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {[l.job_date, l.start_time, l.equipment_type, l.material].filter(Boolean).join(' · ')}
                  </div>
                  {l.decline_reason && <div className="text-xs text-red-700 mt-0.5">Declined: {l.decline_reason}</div>}
                  {l.work_order_id && (
                    <Link href={`/work-orders/${l.work_order_id}`} className="inline-block text-xs text-brand-700 hover:underline mt-1">
                      Open the haul ticket →
                    </Link>
                  )}
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${LOAD_STATUS_TONE[l.status as LoadStatus]}`}>
                  {LOAD_STATUS_LABEL[l.status as LoadStatus]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={card}>
        <div className="flex items-baseline justify-between gap-2 flex-wrap mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Tickets on this order
          </h2>
          {tickets.length > 0 && (
            <span className="text-sm text-gray-600">
              {hours.toFixed(2)} hrs · {tons.toFixed(2)} tons ·{' '}
              <strong>${billed.toFixed(2)}</strong>
            </span>
          )}
        </div>

        {tickets.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nothing filed against this order yet. A crew picks it on the ticket
            form, or it fills in when a hauler accepts a load for it.
          </p>
        ) : (
          <div className="space-y-2">
            {tickets.map((t) => {
              const isFlagged = t.order_mismatch && !t.mismatch_cleared_at;
              return (
                <div
                  key={t.id}
                  className={`border rounded-md px-3 py-2 ${isFlagged ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                >
                  <div className="flex justify-between items-start gap-3 flex-wrap">
                    <div className="min-w-0">
                      <Link href={`/work-orders/${t.id}`} className="font-medium text-sm hover:text-brand-700">
                        {t.job_date || 'Ticket'}
                        {t.unit_number ? ` · Unit ${t.unit_number}` : ''}
                        {t.driver_name ? ` · ${t.driver_name}` : ''}
                      </Link>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {[
                          `${totalHours(t).toFixed(2)} hrs`,
                          t.loads_count > 0 ? `${t.loads_count} loads · ${Number(t.loads_tons).toFixed(2)} tons` : null,
                          `$${ticketAmount(t).toFixed(2)}`,
                        ].filter(Boolean).join(' · ')}
                      </div>
                      {t.order_mismatch && (
                        <div className={`text-xs mt-1 ${t.mismatch_cleared_at ? 'text-gray-500' : 'text-red-700 font-medium'}`}>
                          {t.mismatch_cleared_at ? 'Checked and allowed: ' : "Doesn't match: "}
                          {t.order_mismatch}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_TONE[t.status as WorkOrderStatus]}`}>
                        {STATUS_LABEL[t.status as WorkOrderStatus]}
                      </span>
                    </div>
                  </div>
                  {isFlagged && (
                    <button
                      onClick={() => clearFlag(t)}
                      disabled={busy === t.id}
                      className="mt-2 px-2.5 py-1 text-xs rounded-md border border-red-300 bg-white hover:bg-red-100 disabled:opacity-50"
                    >
                      {busy === t.id ? 'Saving…' : 'I checked it — allow'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
