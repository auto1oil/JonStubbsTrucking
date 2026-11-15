'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import TruckForm from '@/components/TruckForm';
import TicketAttachment from '@/components/TicketAttachment';
import {
  DOC_KINDS, MAINTENANCE_KINDS, REPAIR_STATUSES, FLEET_BUCKET, docDue, maintenanceDue, money, todayISO,
  type FleetTruck, type FleetDocument, type FleetMaintenance, type FleetRepair, type FleetFuel, type FleetTrip, type FleetTripState,
} from '@/lib/fleet';
import { useFleetScope, truckLabel, fInput, fLabel, fCard, fBtn, fBtnGhost, numOrNull, txtOrNull } from '@/lib/fleet-client';

// One truck: its paperwork, what's been done to it, what's wrong with it,
// and what it has burned and driven lately. Each section adds in place.

const DUE_TONE = { overdue: 'text-red-700', soon: 'text-amber-700', ok: 'text-gray-500', none: 'text-gray-400' };

export default function TruckPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const scope = useFleetScope();
  const [truck, setTruck] = useState<FleetTruck | null>(null);
  const [editing, setEditing] = useState(false);
  const [docs, setDocs] = useState<FleetDocument[]>([]);
  const [maint, setMaint] = useState<FleetMaintenance[]>([]);
  const [repairs, setRepairs] = useState<FleetRepair[]>([]);
  const [fuel, setFuel] = useState<FleetFuel[]>([]);
  const [trips, setTrips] = useState<(FleetTrip & { states?: FleetTripState[] })[]>([]);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState<'' | 'doc' | 'maint' | 'repair'>('');

  const refresh = useCallback(async () => {
    const [{ data: t }, { data: d }, { data: m }, { data: r }, { data: f }, { data: tr }] = await Promise.all([
      supabase.from('fleet_trucks').select('*').eq('id', params.id).maybeSingle(),
      supabase.from('fleet_truck_documents').select('*').eq('truck_id', params.id).order('expires_at', { ascending: true, nullsFirst: false }),
      supabase.from('fleet_maintenance').select('*').eq('truck_id', params.id).order('done_at', { ascending: false }),
      supabase.from('fleet_repairs').select('*').eq('truck_id', params.id).order('reported_at', { ascending: false }),
      supabase.from('fleet_fuel').select('*').eq('truck_id', params.id).order('at', { ascending: false }).limit(10),
      supabase.from('fleet_trips').select('*, states:fleet_trip_states(*)').eq('truck_id', params.id).order('started_at', { ascending: false }).limit(10),
    ]);
    if (!t) { setError('That truck is not in your fleet.'); return; }
    setTruck(t as FleetTruck); setDocs((d as FleetDocument[]) || []); setMaint((m as FleetMaintenance[]) || []);
    setRepairs((r as FleetRepair[]) || []); setFuel((f as FleetFuel[]) || []);
    setTrips((tr as (FleetTrip & { states?: FleetTripState[] })[]) || []);
  }, [supabase, params.id]);
  useEffect(() => { refresh(); }, [refresh]);

  // ---- add forms -----------------------------------------------------------
  const [doc, setDoc] = useState({ kind: 'registration', number: '', issued_at: '', expires_at: '', notes: '', file_path: null as string | null });
  const [mt, setMt] = useState({ kind: 'oil_change', done_at: todayISO(), odometer: '', cost: '', vendor: '', notes: '', next_due_at: '', next_due_odometer: '', file_path: null as string | null });
  const [rp, setRp] = useState({ description: '', reported_at: todayISO(), notes: '', file_path: null as string | null });
  const [busy, setBusy] = useState(false);

  // Picking a maintenance kind suggests the next due date/odometer from the
  // usual interval; the office can change it.
  function pickMaintKind(kind: string) {
    const k = MAINTENANCE_KINDS.find((x) => x.key === kind);
    const odo = numOrNull(mt.odometer) ?? truck?.odometer ?? null;
    let nextDate = '';
    if (k?.days) { const d = new Date(mt.done_at + 'T00:00:00'); d.setDate(d.getDate() + k.days); nextDate = d.toISOString().slice(0, 10); }
    setMt((x) => ({ ...x, kind, next_due_at: nextDate, next_due_odometer: k?.miles && odo != null ? String(odo + k.miles) : '' }));
  }

  async function addDoc() {
    setBusy(true); setError('');
    const { error: err } = await supabase.from('fleet_truck_documents').insert({
      truck_id: params.id, kind: doc.kind, number: txtOrNull(doc.number), issued_at: doc.issued_at || null,
      expires_at: doc.expires_at || null, notes: txtOrNull(doc.notes), file_path: doc.file_path,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setDoc({ kind: 'registration', number: '', issued_at: '', expires_at: '', notes: '', file_path: null }); setAdding(''); refresh();
  }
  async function addMaint() {
    setBusy(true); setError('');
    const odo = numOrNull(mt.odometer);
    const { error: err } = await supabase.from('fleet_maintenance').insert({
      truck_id: params.id, kind: mt.kind, done_at: mt.done_at, odometer: odo, cost: numOrNull(mt.cost), vendor: txtOrNull(mt.vendor),
      notes: txtOrNull(mt.notes), next_due_at: mt.next_due_at || null, next_due_odometer: numOrNull(mt.next_due_odometer), file_path: mt.file_path,
    });
    if (!err && odo != null && truck && (truck.odometer == null || odo > truck.odometer)) {
      await supabase.from('fleet_trucks').update({ odometer: odo }).eq('id', params.id);
    }
    setBusy(false);
    if (err) { setError(err.message); return; }
    setMt({ kind: 'oil_change', done_at: todayISO(), odometer: '', cost: '', vendor: '', notes: '', next_due_at: '', next_due_odometer: '', file_path: null }); setAdding(''); refresh();
  }
  async function addRepair() {
    if (!rp.description.trim()) { setError('Say what is wrong.'); return; }
    setBusy(true); setError('');
    const { error: err } = await supabase.from('fleet_repairs').insert({
      truck_id: params.id, description: rp.description.trim(), reported_at: rp.reported_at, reported_by: scope?.userId ?? null,
      notes: txtOrNull(rp.notes), file_path: rp.file_path,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setRp({ description: '', reported_at: todayISO(), notes: '', file_path: null }); setAdding(''); refresh();
  }
  async function setRepairStatus(r: FleetRepair, status: string) {
    const patch: Record<string, unknown> = { status };
    if (status === 'done') {
      const cost = window.prompt('Cost, if any (leave blank for none):', r.cost != null ? String(r.cost) : '');
      if (cost === null) return;
      patch.cost = cost.trim() === '' ? null : Number(cost);
      patch.done_at = todayISO();
    }
    const { error: err } = await supabase.from('fleet_repairs').update(patch).eq('id', r.id);
    if (err) { setError(err.message); return; }
    refresh();
  }
  async function remove(table: string, id: string) {
    if (!window.confirm('Remove this entry?')) return;
    const { error: err } = await supabase.from(table).delete().eq('id', id);
    if (err) { setError(err.message); return; }
    refresh();
  }

  const open = (path: string | null) => async () => {
    if (!path) return;
    const tab = window.open('about:blank', '_blank');
    const { data } = await supabase.storage.from(FLEET_BUCKET).createSignedUrl(path, 300);
    if (data?.signedUrl && tab) tab.location.href = data.signedUrl; else tab?.close();
  };

  if (error && !truck) return <p className="text-sm text-red-600">{error}</p>;
  if (!truck) return <p className="text-sm text-gray-500">Loading…</p>;

  const section = (id: string, title: string, addKey: '' | 'doc' | 'maint' | 'repair', body: React.ReactNode, form: React.ReactNode) => (
    <div id={id} className={fCard}>
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
        {addKey && <button onClick={() => setAdding(adding === addKey ? '' : addKey)} className="text-sm text-brand-700 hover:underline">{adding === addKey ? 'Close' : '+ Add'}</button>}
      </div>
      {adding === addKey && addKey && <div className="rounded-md border border-gray-200 bg-gray-50 p-3 mb-3">{form}</div>}
      {body}
    </div>
  );

  return (
    <div className="space-y-4">
      <Link href="/fleet" className="text-sm text-brand-700 hover:underline">← Fleet</Link>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold">{truckLabel(truck)}</h1>
        <button onClick={() => setEditing((v) => !v)} className="text-sm text-brand-700 hover:underline">{editing ? 'Close' : 'Edit truck'}</button>
      </div>
      {editing ? <TruckForm truck={truck} onSaved={(t) => { setTruck(t); setEditing(false); }} /> : (
        <p className="text-sm text-gray-600">
          {[truck.vin ? `VIN ${truck.vin}` : null, truck.plate ? `Plate ${truck.plate_state || ''} ${truck.plate}`.trim() : null,
            truck.odometer != null ? `${truck.odometer.toLocaleString()} mi` : 'no odometer yet', truck.active ? null : 'out of service'].filter(Boolean).join(' · ')}
          {truck.notes && <span className="block text-gray-500 mt-1 whitespace-pre-wrap">{truck.notes}</span>}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {section('documents', 'Registration & documents', 'doc', (
        docs.length === 0 ? <p className="text-sm text-gray-500">Nothing on file. Add the registration, insurance and IFTA decal so their expiry dates are watched.</p> : (
          <ul className="divide-y divide-gray-100">
            {docs.map((d) => { const due = docDue(d); return (
              <li key={d.id} className="py-2 flex items-start justify-between gap-3 text-sm">
                <div>
                  <div className="font-medium">{DOC_KINDS.find((k) => k.key === d.kind)?.label || d.kind}{d.number ? ` · ${d.number}` : ''}</div>
                  <div className={`text-xs ${DUE_TONE[due.level]}`}>{due.text}{d.issued_at ? ` · issued ${d.issued_at}` : ''}</div>
                  {d.notes && <div className="text-xs text-gray-500">{d.notes}</div>}
                </div>
                <div className="flex gap-3 shrink-0 text-xs">
                  {d.file_path && <button onClick={open(d.file_path)} className="text-brand-700 hover:underline">Open</button>}
                  <button onClick={() => remove('fleet_truck_documents', d.id)} className="text-gray-400 hover:text-red-600">Remove</button>
                </div>
              </li>); })}
          </ul>
        )
      ), (
        <div className="grid grid-cols-2 gap-3">
          <label><span className={fLabel}>Document</span>
            <select value={doc.kind} onChange={(e) => setDoc({ ...doc, kind: e.target.value })} className={fInput}>{DOC_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></label>
          <label><span className={fLabel}>Number</span><input value={doc.number} onChange={(e) => setDoc({ ...doc, number: e.target.value })} className={fInput} /></label>
          <label><span className={fLabel}>Issued</span><input type="date" value={doc.issued_at} onChange={(e) => setDoc({ ...doc, issued_at: e.target.value })} className={fInput} /></label>
          <label><span className={fLabel}>Expires</span><input type="date" value={doc.expires_at} onChange={(e) => setDoc({ ...doc, expires_at: e.target.value })} className={fInput} /></label>
          <label className="col-span-2"><span className={fLabel}>Notes</span><input value={doc.notes} onChange={(e) => setDoc({ ...doc, notes: e.target.value })} className={fInput} /></label>
          <div className="col-span-2"><TicketAttachment label="Document photo or PDF" path={doc.file_path} onChange={(p) => setDoc({ ...doc, file_path: p })} bucket={FLEET_BUCKET} folder={scope?.folder} /></div>
          <div className="col-span-2"><button onClick={addDoc} disabled={busy} className={fBtn}>{busy ? 'Saving…' : 'Add document'}</button></div>
        </div>
      ))}

      {section('maintenance', 'Maintenance', 'maint', (
        maint.length === 0 ? <p className="text-sm text-gray-500">No maintenance logged yet.</p> : (
          <ul className="divide-y divide-gray-100">
            {maint.map((m) => { const due = maintenanceDue(m, truck.odometer); return (
              <li key={m.id} className="py-2 flex items-start justify-between gap-3 text-sm">
                <div>
                  <div className="font-medium">{MAINTENANCE_KINDS.find((k) => k.key === m.kind)?.label || m.kind} · {m.done_at}{m.odometer != null ? ` · ${m.odometer.toLocaleString()} mi` : ''}{m.cost != null ? ` · ${money(m.cost)}` : ''}</div>
                  <div className={`text-xs ${DUE_TONE[due.level]}`}>Next: {due.text}{m.vendor ? ` · ${m.vendor}` : ''}</div>
                  {m.notes && <div className="text-xs text-gray-500">{m.notes}</div>}
                </div>
                <div className="flex gap-3 shrink-0 text-xs">
                  {m.file_path && <button onClick={open(m.file_path)} className="text-brand-700 hover:underline">Receipt</button>}
                  <button onClick={() => remove('fleet_maintenance', m.id)} className="text-gray-400 hover:text-red-600">Remove</button>
                </div>
              </li>); })}
          </ul>
        )
      ), (
        <div className="grid grid-cols-2 gap-3">
          <label><span className={fLabel}>What was done</span>
            <select value={mt.kind} onChange={(e) => pickMaintKind(e.target.value)} className={fInput}>{MAINTENANCE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select></label>
          <label><span className={fLabel}>Date</span><input type="date" value={mt.done_at} onChange={(e) => setMt({ ...mt, done_at: e.target.value })} className={fInput} /></label>
          <label><span className={fLabel}>Odometer</span><input type="number" inputMode="numeric" value={mt.odometer} onChange={(e) => setMt({ ...mt, odometer: e.target.value })} className={fInput} placeholder={truck.odometer != null ? String(truck.odometer) : ''} /></label>
          <label><span className={fLabel}>Cost</span><input type="number" step="0.01" inputMode="decimal" value={mt.cost} onChange={(e) => setMt({ ...mt, cost: e.target.value })} className={fInput} /></label>
          <label><span className={fLabel}>Shop / vendor</span><input value={mt.vendor} onChange={(e) => setMt({ ...mt, vendor: e.target.value })} className={fInput} /></label>
          <label><span className={fLabel}>Next due (date)</span><input type="date" value={mt.next_due_at} onChange={(e) => setMt({ ...mt, next_due_at: e.target.value })} className={fInput} /></label>
          <label><span className={fLabel}>Next due (odometer)</span><input type="number" inputMode="numeric" value={mt.next_due_odometer} onChange={(e) => setMt({ ...mt, next_due_odometer: e.target.value })} className={fInput} /></label>
          <label><span className={fLabel}>Notes</span><input value={mt.notes} onChange={(e) => setMt({ ...mt, notes: e.target.value })} className={fInput} /></label>
          <div className="col-span-2"><TicketAttachment label="Receipt" path={mt.file_path} onChange={(p) => setMt({ ...mt, file_path: p })} bucket={FLEET_BUCKET} folder={scope?.folder} /></div>
          <div className="col-span-2"><button onClick={addMaint} disabled={busy} className={fBtn}>{busy ? 'Saving…' : 'Log maintenance'}</button></div>
        </div>
      ))}

      {section('repairs', 'Repairs', 'repair', (
        repairs.length === 0 ? <p className="text-sm text-gray-500">Nothing reported.</p> : (
          <ul className="divide-y divide-gray-100">
            {repairs.map((r) => (
              <li key={r.id} className="py-2 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{r.description}</div>
                    <div className="text-xs text-gray-500">Reported {r.reported_at}{r.done_at ? ` · fixed ${r.done_at}` : ''}{r.cost != null ? ` · ${money(r.cost)}` : ''}{r.vendor ? ` · ${r.vendor}` : ''}</div>
                    {r.notes && <div className="text-xs text-gray-500">{r.notes}</div>}
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${r.status === 'done' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : r.status === 'in_shop' ? 'bg-blue-100 text-blue-900 border-blue-200' : 'bg-red-100 text-red-800 border-red-200'}`}>
                    {REPAIR_STATUSES.find((s) => s.key === r.status)?.label}
                  </span>
                </div>
                <div className="flex gap-3 mt-1 text-xs">
                  {r.status === 'open' && <button onClick={() => setRepairStatus(r, 'in_shop')} className="text-brand-700 hover:underline">In the shop</button>}
                  {r.status !== 'done' && <button onClick={() => setRepairStatus(r, 'done')} className="text-brand-700 hover:underline">Mark fixed</button>}
                  {r.file_path && <button onClick={open(r.file_path)} className="text-brand-700 hover:underline">Photo</button>}
                  <button onClick={() => remove('fleet_repairs', r.id)} className="text-gray-400 hover:text-red-600">Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )
      ), (
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2"><span className={fLabel}>What&apos;s wrong</span><input value={rp.description} onChange={(e) => setRp({ ...rp, description: e.target.value })} className={fInput} placeholder="Air leak at the rear brake chamber" /></label>
          <label><span className={fLabel}>Noticed on</span><input type="date" value={rp.reported_at} onChange={(e) => setRp({ ...rp, reported_at: e.target.value })} className={fInput} /></label>
          <label><span className={fLabel}>Notes</span><input value={rp.notes} onChange={(e) => setRp({ ...rp, notes: e.target.value })} className={fInput} /></label>
          <div className="col-span-2"><TicketAttachment label="Photo" path={rp.file_path} onChange={(p) => setRp({ ...rp, file_path: p })} bucket={FLEET_BUCKET} folder={scope?.folder} /></div>
          <div className="col-span-2"><button onClick={addRepair} disabled={busy} className={fBtn}>{busy ? 'Saving…' : 'Report repair'}</button></div>
        </div>
      ))}

      <div className={fCard}>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Recent fuel</h2>
          <Link href={`/fleet/fuel?add=1&truck=${truck.id}`} className="text-sm text-brand-700 hover:underline">+ Log fuel</Link>
        </div>
        {fuel.length === 0 ? <p className="text-sm text-gray-500">No fuel logged.</p> : (
          <ul className="divide-y divide-gray-100 text-sm">
            {fuel.map((f) => (
              <li key={f.id} className="py-1.5 flex justify-between gap-3">
                <span>{new Date(f.at).toLocaleDateString()} · {Number(f.gallons).toFixed(1)} gal in {f.state}{f.vendor ? ` · ${f.vendor}` : ''}</span>
                <span className="tabular-nums">{money(f.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={fCard}>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Recent trips</h2>
          <Link href="/fleet/trip" className="text-sm text-brand-700 hover:underline">Trip screen</Link>
        </div>
        {trips.length === 0 ? <p className="text-sm text-gray-500">No trips yet.</p> : (
          <ul className="divide-y divide-gray-100 text-sm">
            {trips.map((t) => (
              <li key={t.id} className="py-1.5">
                <div className="flex justify-between gap-3">
                  <span>{new Date(t.started_at).toLocaleDateString()}{t.status === 'active' ? ' · in progress' : ''}{t.manual ? ' · entered by hand' : ''}</span>
                  <span className="tabular-nums">{t.miles != null ? `${Number(t.miles).toFixed(1)} mi` : ''}</span>
                </div>
                {t.states && t.states.length > 0 && (
                  <div className="text-xs text-gray-500">{t.states.map((s) => `${s.state} ${Number(s.miles).toFixed(1)}`).join(' · ')}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button onClick={() => { if (window.confirm('Remove this truck and everything logged on it?')) remove('fleet_trucks', truck.id).then(() => { window.location.href = '/fleet'; }); }} className={`${fBtnGhost} text-red-700`}>
        Remove truck
      </button>
    </div>
  );
}
