'use client';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { currentQuarter, recentQuarters, quarterBounds, type FleetTrip, type FleetTripState, type FleetFuel } from '@/lib/fleet';
import { useTrucks, fInput, fCard, fBtnGhost } from '@/lib/fleet-client';

// The IFTA quarter: miles driven and gallons bought in each state, from the
// trips and fill-ups. Fleet MPG = total miles / total gallons; each state's
// taxable gallons = its miles / fleet MPG; net = taxable minus what was
// bought there. Tax rates change every quarter and are applied on the
// return itself, so they're left off here; the CSV goes to whoever files.

type Row = { state: string; miles: number; gallons: number; taxable: number; net: number };

export default function IftaPage() {
  const supabase = createClient();
  const { trucks } = useTrucks();
  const [quarter, setQuarter] = useState(currentQuarter());
  const [truckId, setTruckId] = useState('');
  const [trips, setTrips] = useState<(FleetTrip & { states: FleetTripState[] })[]>([]);
  const [fuel, setFuel] = useState<FleetFuel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { start, end } = quarterBounds(quarter);
      const [{ data: t }, { data: f }] = await Promise.all([
        supabase.from('fleet_trips').select('*, states:fleet_trip_states(*)').eq('status', 'ended')
          .gte('ended_at', `${start}T00:00:00`).lte('ended_at', `${end}T23:59:59`),
        supabase.from('fleet_fuel').select('*').gte('at', `${start}T00:00:00`).lte('at', `${end}T23:59:59`),
      ]);
      setTrips((t as (FleetTrip & { states: FleetTripState[] })[]) || []);
      setFuel((f as FleetFuel[]) || []);
      setLoading(false);
    })();
  }, [supabase, quarter]);

  const rows = useMemo<Row[]>(() => {
    const miles: Record<string, number> = {}; const gallons: Record<string, number> = {};
    for (const t of trips) {
      if (truckId && t.truck_id !== truckId) continue;
      for (const s of t.states || []) miles[s.state] = (miles[s.state] || 0) + Number(s.miles);
    }
    for (const f of fuel) {
      if (truckId && f.truck_id !== truckId) continue;
      gallons[f.state] = (gallons[f.state] || 0) + Number(f.gallons);
    }
    const totalMiles = Object.values(miles).reduce((a, b) => a + b, 0);
    const totalGal = Object.values(gallons).reduce((a, b) => a + b, 0);
    const mpg = totalGal > 0 ? totalMiles / totalGal : 0;
    const states = Array.from(new Set([...Object.keys(miles), ...Object.keys(gallons)])).sort();
    return states.map((st) => {
      const m = miles[st] || 0; const g = gallons[st] || 0;
      const taxable = mpg > 0 ? m / mpg : 0;
      return { state: st, miles: m, gallons: g, taxable, net: taxable - g };
    });
  }, [trips, fuel, truckId]);

  const totalMiles = rows.reduce((a, r) => a + r.miles, 0);
  const totalGal = rows.reduce((a, r) => a + r.gallons, 0);
  const mpg = totalGal > 0 ? totalMiles / totalGal : 0;
  const unknown = rows.find((r) => r.state === 'XX');

  function csv() {
    const lines = [['Quarter', quarter], ['Truck', truckId ? (trucks.find((t) => t.id === truckId)?.unit_number || '') : 'All'], [],
      ['State', 'Miles', 'Gallons bought', 'Taxable gallons', 'Net gallons'],
      ...rows.map((r) => [r.state, r.miles.toFixed(1), r.gallons.toFixed(3), r.taxable.toFixed(3), r.net.toFixed(3)]),
      ['Total', totalMiles.toFixed(1), totalGal.toFixed(3), '', ''], ['Fleet MPG', mpg.toFixed(2)]];
    const blob = new Blob([lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `ifta-${quarter}${truckId ? '-unit-' + (trucks.find((t) => t.id === truckId)?.unit_number || '') : ''}.csv`; a.click();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">IFTA</h1>
      <div className="flex gap-2 flex-wrap items-end">
        <label className="text-xs text-gray-600">Quarter
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)} className={`${fInput} mt-1`}>{recentQuarters().map((q) => <option key={q} value={q}>{q}</option>)}</select></label>
        <label className="text-xs text-gray-600">Truck
          <select value={truckId} onChange={(e) => setTruckId(e.target.value)} className={`${fInput} mt-1`}>
            <option value="">All trucks</option>{trucks.map((t) => <option key={t.id} value={t.id}>Unit {t.unit_number}</option>)}
          </select></label>
        <button onClick={csv} disabled={rows.length === 0} className={fBtnGhost}>Download CSV</button>
      </div>

      <div className={fCard}>
        {loading ? <p className="text-sm text-gray-500">Adding it up…</p> : rows.length === 0 ? (
          <p className="text-sm text-gray-500">No ended trips or fill-ups in {quarter}{truckId ? ' for that truck' : ''}.</p>
        ) : (
          <>
            <div className="text-sm text-gray-700 mb-2 flex gap-x-5 gap-y-1 flex-wrap">
              <span><strong className="tabular-nums">{totalMiles.toFixed(0)}</strong> miles</span>
              <span><strong className="tabular-nums">{totalGal.toFixed(1)}</strong> gallons</span>
              <span>Fleet MPG <strong className="tabular-nums">{mpg > 0 ? mpg.toFixed(2) : '—'}</strong></span>
              <span>{trips.filter((t) => !truckId || t.truck_id === truckId).length} trips · {fuel.filter((f) => !truckId || f.truck_id === truckId).length} fill-ups</span>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500">
                <th className="py-1 font-medium">State</th><th className="py-1 font-medium text-right">Miles</th><th className="py-1 font-medium text-right">Gal bought</th><th className="py-1 font-medium text-right">Taxable gal</th><th className="py-1 font-medium text-right">Net gal</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.state} className="border-t border-gray-100">
                    <td className="py-1 font-medium">{r.state === 'XX' ? 'Unknown' : r.state}</td>
                    <td className="py-1 text-right tabular-nums">{r.miles.toFixed(1)}</td>
                    <td className="py-1 text-right tabular-nums">{r.gallons.toFixed(1)}</td>
                    <td className="py-1 text-right tabular-nums">{r.taxable.toFixed(1)}</td>
                    <td className={`py-1 text-right tabular-nums ${r.net > 0 ? 'text-red-700' : r.net < 0 ? 'text-emerald-700' : ''}`}>{r.net > 0 ? '+' : ''}{r.net.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] text-gray-500 mt-2">
              Net gallons above zero means tax is owed to that state on the return; below zero is a credit. Multiply by each state&apos;s rate for the quarter when filing.
              {unknown ? ' "Unknown" miles came from trips whose GPS points fell outside any state outline (or had none) — open those trips and assign a state.' : ''}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
