'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import {
  docDue, maintenanceDue, DOC_KINDS, MAINTENANCE_KINDS,
  type FleetTruck, type FleetDocument, type FleetMaintenance, type FleetRepair, type FleetTrip,
} from '@/lib/fleet';
import { useTrucks, truckLabel, fCard, fBtn, fBtnGhost } from '@/lib/fleet-client';

// The fleet at a glance: every truck with what's due on it, and the three
// things a driver does most — start a trip, log fuel, snap a receipt.

type Attention = { truckId: string; unit: string; level: 'overdue' | 'soon'; text: string; href: string };

export default function FleetHomePage() {
  const supabase = createClient();
  const { trucks, loading } = useTrucks();
  const [docs, setDocs] = useState<FleetDocument[]>([]);
  const [maint, setMaint] = useState<FleetMaintenance[]>([]);
  const [repairs, setRepairs] = useState<FleetRepair[]>([]);
  const [activeTrips, setActiveTrips] = useState<FleetTrip[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: d }, { data: m }, { data: r }, { data: t }] = await Promise.all([
        supabase.from('fleet_truck_documents').select('*').not('expires_at', 'is', null),
        supabase.from('fleet_maintenance').select('*').or('next_due_at.not.is.null,next_due_odometer.not.is.null'),
        supabase.from('fleet_repairs').select('*').neq('status', 'done'),
        supabase.from('fleet_trips').select('*').eq('status', 'active'),
      ]);
      setDocs((d as FleetDocument[]) || []); setMaint((m as FleetMaintenance[]) || []);
      setRepairs((r as FleetRepair[]) || []); setActiveTrips((t as FleetTrip[]) || []);
    })();
  }, [supabase]);

  const byTruck = Object.fromEntries(trucks.map((t) => [t.id, t]));
  const attention: Attention[] = [];
  for (const d of docs) {
    const due = docDue(d); const t = byTruck[d.truck_id];
    if (t && (due.level === 'overdue' || due.level === 'soon')) {
      attention.push({ truckId: t.id, unit: t.unit_number, level: due.level, text: `${DOC_KINDS.find((k) => k.key === d.kind)?.label || d.kind} ${due.text}`, href: `/fleet/trucks/${t.id}#documents` });
    }
  }
  // Only the newest record of each kind per truck decides whether it's due.
  const newest: Record<string, FleetMaintenance> = {};
  for (const m of [...maint].sort((a, b) => a.done_at.localeCompare(b.done_at))) newest[`${m.truck_id}:${m.kind}`] = m;
  for (const m of Object.values(newest)) {
    const t = byTruck[m.truck_id]; if (!t) continue;
    const due = maintenanceDue(m, t.odometer);
    if (due.level === 'overdue' || due.level === 'soon') {
      attention.push({ truckId: t.id, unit: t.unit_number, level: due.level, text: `${MAINTENANCE_KINDS.find((k) => k.key === m.kind)?.label || m.kind} ${due.text}`, href: `/fleet/trucks/${t.id}#maintenance` });
    }
  }
  for (const r of repairs) {
    const t = byTruck[r.truck_id]; if (!t) continue;
    attention.push({ truckId: t.id, unit: t.unit_number, level: 'soon', text: `Repair ${r.status === 'in_shop' ? 'in the shop' : 'reported'}: ${r.description}`, href: `/fleet/trucks/${t.id}#repairs` });
  }
  attention.sort((a, b) => (a.level === b.level ? a.unit.localeCompare(b.unit) : a.level === 'overdue' ? -1 : 1));
  const countFor = (id: string) => attention.filter((a) => a.truckId === id);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold">Fleet</h1>
        <Link href="/fleet/trucks/new" className="text-sm text-brand-700 hover:underline">+ Add a truck</Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Link href="/fleet/trip" className={`${fBtn} text-center`}>{activeTrips.length ? 'Trip in progress' : 'Start a trip'}</Link>
        <Link href="/fleet/fuel?add=1" className={`${fBtnGhost} text-center bg-white`}>Log fuel</Link>
        <Link href="/fleet/receipts?add=1" className={`${fBtnGhost} text-center bg-white`}>Add receipt</Link>
      </div>

      {attention.length > 0 && (
        <div className={`${fCard} border-amber-200`}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">Needs attention</h2>
          <ul className="space-y-1.5">
            {attention.map((a, i) => (
              <li key={i} className="text-sm">
                <Link href={a.href} className="hover:underline">
                  <span className={`inline-block w-2 h-2 rounded-full mr-2 ${a.level === 'overdue' ? 'bg-red-600' : 'bg-amber-500'}`} />
                  <strong>Unit {a.unit}</strong> — {a.text}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={fCard}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-2">Trucks</h2>
        {loading ? <p className="text-sm text-gray-500">Loading…</p>
        : trucks.length === 0 ? (
          <p className="text-sm text-gray-600">No trucks yet. <Link href="/fleet/trucks/new" className="text-brand-700 hover:underline">Add the first one</Link> — unit number is all it needs to start.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {trucks.map((t) => {
              const items = countFor(t.id);
              const onTrip = activeTrips.find((x) => x.truck_id === t.id);
              return (
                <Link key={t.id} href={`/fleet/trucks/${t.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded">
                  <div className="min-w-0">
                    <div className={`font-medium text-sm ${t.active ? '' : 'text-gray-400'}`}>{truckLabel(t)}{t.active ? '' : ' · out of service'}</div>
                    <div className="text-xs text-gray-500">
                      {[t.plate ? `${t.plate_state || ''} ${t.plate}`.trim() : null, t.odometer != null ? `${t.odometer.toLocaleString()} mi` : null, onTrip ? 'on a trip now' : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {items.length > 0 && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${items.some((i) => i.level === 'overdue') ? 'bg-red-100 text-red-800 border-red-200' : 'bg-amber-100 text-amber-900 border-amber-200'}`}>
                      {items.length} due
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
