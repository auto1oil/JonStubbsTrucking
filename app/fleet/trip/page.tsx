'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { US_STATES, todayISO, type FleetTrip } from '@/lib/fleet';
import { useFleetScope, useTrucks, truckLabel, fInput, fLabel, fCard, fBtn, fBtnGhost, numOrNull } from '@/lib/fleet-client';

// The driver's trip screen. Start a trip with the truck and the odometer;
// while it runs the phone sends a breadcrumb every half minute so the miles
// are split by state for IFTA; end it with the odometer. Breadcrumbs only
// flow while the app is open on screen (phones suspend pages in the
// background), which is why the odometer is what the total is taken from
// when both readings are in. A trip done without the app is typed in below.

const PING_MS = 30_000;

type Fix = { lat: number; lng: number; accuracy: number } | null;
function getFix(): Promise<Fix> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    const t = setTimeout(() => resolve(null), 10_000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); resolve({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)), accuracy: Math.round(p.coords.accuracy) }); },
      () => { clearTimeout(t); resolve(null); },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 15_000 },
    );
  });
}

export default function TripPage() {
  const supabase = createClient();
  const scope = useFleetScope();
  const { trucks } = useTrucks();
  const active = trucks.filter((t) => t.active);
  const [trip, setTrip] = useState<FleetTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [truckId, setTruckId] = useState('');
  const [odoStart, setOdoStart] = useState('');
  const [odoEnd, setOdoEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lastPing, setLastPing] = useState<{ at: Date; state: string | null } | null>(null);
  const [pings, setPings] = useState(0);
  const [result, setResult] = useState<{ miles: number; states: Record<string, number> } | null>(null);
  // Entered by hand
  const [manual, setManual] = useState({ truck_id: '', date: todayISO(), miles: '', state: 'UT', notes: '' });
  const [showManual, setShowManual] = useState(false);

  const loadActive = useCallback(async () => {
    if (!scope?.userId) return;
    const { data } = await supabase.from('fleet_trips').select('*').eq('status', 'active').eq('driver_id', scope.userId)
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    setTrip((data as FleetTrip | null) ?? null);
    setLoading(false);
  }, [supabase, scope?.userId]);
  useEffect(() => { loadActive(); }, [loadActive]);

  useEffect(() => {
    if (!truckId && active.length > 0) {
      try { setTruckId(localStorage.getItem('jst-last-truck') || active[0].id); } catch { setTruckId(active[0].id); }
    }
  }, [active, truckId]);
  useEffect(() => {
    const t = trucks.find((x) => x.id === truckId);
    if (t?.odometer != null && !odoStart) setOdoStart(String(t.odometer));
  }, [truckId, trucks, odoStart]);

  // Breadcrumbs while a trip runs.
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const ping = useCallback(async () => {
    if (!trip) return;
    const fix = await getFix();
    if (!fix) return;
    try {
      const res = await fetch(`/api/fleet/trips/${trip.id}/ping`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fix), keepalive: true });
      const j = await res.json();
      if (j.ok) { setLastPing({ at: new Date(), state: j.state }); setPings((n) => n + 1); }
    } catch { /* next one */ }
  }, [trip]);
  useEffect(() => {
    if (!trip) return;
    ping();
    timer.current = setInterval(ping, PING_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { if (timer.current) clearInterval(timer.current); document.removeEventListener('visibilitychange', onVisible); };
  }, [trip, ping]);

  async function start() {
    if (!truckId) { setError('Pick the truck.'); return; }
    setBusy(true); setError(''); setResult(null);
    const fix = await getFix();
    const { data, error: err } = await supabase.from('fleet_trips').insert({
      truck_id: truckId, driver_id: scope?.userId ?? null, odometer_start: numOrNull(odoStart),
      start_lat: fix?.lat ?? null, start_lng: fix?.lng ?? null,
    }).select('*').single();
    setBusy(false);
    if (err) { setError(err.message); return; }
    try { localStorage.setItem('jst-last-truck', truckId); } catch { /* fine */ }
    setTrip(data as FleetTrip); setPings(0); setLastPing(null);
  }

  async function end() {
    if (!trip) return;
    setBusy(true); setError('');
    const fix = await getFix();
    try {
      const res = await fetch(`/api/fleet/trips/${trip.id}/end`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ odometer_end: numOrNull(odoEnd), lat: fix?.lat, lng: fix?.lng }),
      });
      const j = await res.json();
      if (!j.ok) { setError(j.error || 'Could not end the trip.'); return; }
      setResult({ miles: j.miles, states: j.states });
      setTrip(null); setOdoEnd(''); setOdoStart('');
    } catch {
      setError('No signal — try again when you have bars. The trip stays open.');
    } finally {
      setBusy(false);
    }
  }

  async function addManual() {
    const miles = numOrNull(manual.miles);
    if (!manual.truck_id || !miles || miles <= 0) { setError('Pick the truck and enter the miles.'); return; }
    setBusy(true); setError('');
    const at = new Date(manual.date + 'T12:00:00').toISOString();
    const { data, error: err } = await supabase.from('fleet_trips').insert({
      truck_id: manual.truck_id, driver_id: scope?.userId ?? null, started_at: at, ended_at: at, status: 'ended',
      manual: true, state: manual.state, miles, gps_miles: 0, notes: manual.notes.trim() || null,
    }).select('id').single();
    if (!err && data) await supabase.from('fleet_trip_states').insert({ trip_id: (data as { id: string }).id, state: manual.state, miles });
    setBusy(false);
    if (err) { setError(err.message); return; }
    setResult({ miles, states: { [manual.state]: miles } });
    setManual({ ...manual, miles: '', notes: '' }); setShowManual(false);
  }

  const truck = trucks.find((t) => t.id === (trip?.truck_id || truckId));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Trip</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className={`${fCard} border-emerald-200 bg-emerald-50 text-sm text-emerald-900`}>
          <strong>Trip saved — {result.miles.toFixed(1)} miles.</strong>
          <div className="text-xs mt-1">{Object.entries(result.states).map(([s, m]) => `${s} ${m.toFixed(1)}`).join(' · ') || 'no state split'}</div>
        </div>
      )}

      {loading ? <p className="text-sm text-gray-500">Loading…</p> : trip ? (
        <div className={`${fCard} border-brand-700 border-2`}>
          <p className="text-sm text-gray-600">Trip in progress · {truckLabel(truck)}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Started {new Date(trip.started_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            {trip.odometer_start != null ? ` at ${trip.odometer_start.toLocaleString()} mi` : ''}
          </p>
          <p className="text-xs mt-2">
            {lastPing
              ? <span className="text-emerald-700">📍 Tracking · last fix {lastPing.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}{lastPing.state ? ` in ${lastPing.state}` : ''} · {pings} point{pings === 1 ? '' : 's'} this session</span>
              : <span className="text-amber-700">Waiting for a GPS fix… keep this screen open while you drive.</span>}
          </p>
          <label className="block mt-3"><span className={fLabel}>Odometer at the end</span>
            <input type="number" inputMode="numeric" value={odoEnd} onChange={(e) => setOdoEnd(e.target.value)} className={`${fInput} text-lg`} placeholder={trip.odometer_start != null ? `more than ${trip.odometer_start.toLocaleString()}` : ''} />
          </label>
          <button onClick={end} disabled={busy} className={`${fBtn} w-full mt-3 py-4 text-base`}>{busy ? 'Ending…' : 'End trip'}</button>
          <p className="text-[11px] text-gray-500 mt-2">Phones stop sending location when the screen is off, so the odometer is what the miles are taken from. The state split comes from the points that did arrive.</p>
        </div>
      ) : (
        <div className={fCard}>
          <label className="block"><span className={fLabel}>Truck</span>
            <select value={truckId} onChange={(e) => { setTruckId(e.target.value); setOdoStart(''); }} className={fInput}>
              {active.length === 0 && <option value="">No trucks yet — add one under Trucks</option>}
              {active.map((t) => <option key={t.id} value={t.id}>{truckLabel(t)}</option>)}
            </select>
          </label>
          <label className="block mt-3"><span className={fLabel}>Odometer now</span>
            <input type="number" inputMode="numeric" value={odoStart} onChange={(e) => setOdoStart(e.target.value)} className={`${fInput} text-lg`} />
          </label>
          <button onClick={start} disabled={busy || !truckId} className={`${fBtn} w-full mt-3 py-4 text-base`}>{busy ? 'Starting…' : 'Start trip'}</button>
          <p className="text-[11px] text-gray-500 mt-2">Keep the app open on this screen while driving and the miles are split by state automatically.</p>
        </div>
      )}

      <div className={fCard}>
        <button onClick={() => setShowManual((v) => !v)} className="text-sm text-brand-700 hover:underline">{showManual ? 'Close' : 'Enter a trip by hand (one state)'}</button>
        {showManual && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <label className="col-span-2"><span className={fLabel}>Truck</span>
              <select value={manual.truck_id} onChange={(e) => setManual({ ...manual, truck_id: e.target.value })} className={fInput}>
                <option value="">— Pick —</option>{active.map((t) => <option key={t.id} value={t.id}>{truckLabel(t)}</option>)}
              </select></label>
            <label><span className={fLabel}>Date</span><input type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} className={fInput} /></label>
            <label><span className={fLabel}>Miles</span><input type="number" inputMode="decimal" value={manual.miles} onChange={(e) => setManual({ ...manual, miles: e.target.value })} className={fInput} /></label>
            <label><span className={fLabel}>State</span>
              <select value={manual.state} onChange={(e) => setManual({ ...manual, state: e.target.value })} className={fInput}>{US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            <label><span className={fLabel}>Notes</span><input value={manual.notes} onChange={(e) => setManual({ ...manual, notes: e.target.value })} className={fInput} /></label>
            <div className="col-span-2 flex gap-2">
              <button onClick={addManual} disabled={busy} className={fBtn}>Save trip</button>
              <button onClick={() => setShowManual(false)} className={fBtnGhost}>Cancel</button>
            </div>
            <p className="col-span-2 text-[11px] text-gray-500">A trip that crossed state lines is entered once per state.</p>
          </div>
        )}
      </div>
    </div>
  );
}
