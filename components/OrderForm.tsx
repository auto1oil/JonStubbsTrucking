'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase-browser';
import { mapsUrl } from '@/lib/maps';
import { DEFAULT_RADIUS_M } from '@/lib/location-check';

// Leaflet touches `window`, so the map only loads in the browser.
const SitePinPicker = dynamic(() => import('./SitePinPicker'), { ssr: false });
import CustomerPicker from '@/components/CustomerPicker';
import { ORDER_STATUSES, ORDER_STATUS_LABEL, type JobOrder } from '@/lib/job-orders';

// Create or edit an order — the job everything else gets tied to.
//
// The fields here are the terms the job was agreed on. Tickets filled against
// this order inherit them, and anything a ticket disagrees with gets flagged,
// so what's typed here is what the invoice is checked against.

const RATE_UNITS = ['hour', 'ton', 'load', 'day'];
const EQUIPMENT_TYPES = [
  'Belly Dump', 'End Dump', 'Side Dump', 'Side Dump Double', 'Super Dump',
  'Water Truck', 'Lowboy', 'Excavator', 'Loader', 'Dozer', 'Blade', 'Skid Steer',
];
const TONNAGE_TYPES = ['', 'Dirt', 'Gravel', 'Asphalt', 'Debris', 'Water', 'Other'];

type Draft = Record<string, string>;

function toDraft(o: JobOrder | null): Draft {
  const v = (x: unknown) => (x === null || x === undefined ? '' : String(x));
  const today = new Date().toISOString().slice(0, 10);
  return {
    business_id: v(o?.business_id),
    customer_number: v(o?.customer_number),
    job_name: v(o?.job_name),
    job_number: v(o?.job_number),
    phase_code: v(o?.phase_code),
    job_address: v(o?.job_address),
    pit_address: v(o?.pit_address),
    material: v(o?.material),
    pit_lat: v(o?.pit_lat),
    pit_lng: v(o?.pit_lng),
    job_lat: v(o?.job_lat),
    job_lng: v(o?.job_lng),
    geo_radius_m: v(o?.geo_radius_m) || String(DEFAULT_RADIUS_M),
    start_date: v(o?.start_date) || today,
    end_date: v(o?.end_date) || today,
    start_time: v(o?.start_time),
    stop_time: v(o?.stop_time),
    travel_hours: v(o?.travel_hours),
    down_hours: v(o?.down_hours),
    rate: v(o?.rate),
    pay_rate: v(o?.pay_rate),
    rate_unit: v(o?.rate_unit) || 'hour',
    fuel_surcharge: v(o?.fuel_surcharge),
    fsr: v(o?.fsr),
    tonnage: v(o?.tonnage),
    tonnage_type: v(o?.tonnage_type),
    equipment_type: v(o?.equipment_type),
    unit_number: v(o?.unit_number),
    status: v(o?.status) || 'open',
    notes: v(o?.notes),
  };
}

export default function OrderForm({ order }: { order: JobOrder | null }) {
  const supabase = createClient();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(order));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const id = order?.id ?? null;
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  // The pins behind the place check. An address is looked up when the
  // office leaves the box (only if that end isn't pinned yet, so a pin they
  // dragged into place is never overwritten), or on demand; a pit with no
  // street address gets its pin dropped on the map.
  const [showMap, setShowMap] = useState<{ pit: boolean; job: boolean }>({ pit: false, job: false });
  const [geocoding, setGeocoding] = useState<'' | 'pit' | 'job'>('');
  const [geoMsg, setGeoMsg] = useState<{ pit: string; job: string }>({ pit: '', job: '' });

  async function locate(which: 'pit' | 'job', force: boolean) {
    const addr = (which === 'pit' ? draft.pit_address : draft.job_address).trim();
    const pinned = draft[`${which}_lat`] !== '' && draft[`${which}_lng`] !== '';
    if (!addr || (pinned && !force)) return;
    setGeocoding(which); setGeoMsg((m) => ({ ...m, [which]: '' }));
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(addr)}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.ok) { setGeoMsg((m) => ({ ...m, [which]: json.error || 'Could not find that address.' })); return; }
      setDraft((d) => ({ ...d, [`${which}_lat`]: String(json.lat), [`${which}_lng`]: String(json.lng) }));
    } catch {
      setGeoMsg((m) => ({ ...m, [which]: 'Could not reach the map service.' }));
    } finally {
      setGeocoding('');
    }
  }

  async function save() {
    if (!draft.job_name.trim() && !draft.job_number.trim()) {
      setError('Give the order a job name or a job number so it can be told apart.');
      return;
    }
    if (draft.end_date && draft.start_date && draft.end_date < draft.start_date) {
      setError('The end date is before the start date.');
      return;
    }
    setBusy(true); setError(''); setMsg('');

    const num = (x: string) => (x.trim() === '' ? null : Number(x));
    const txt = (x: string) => (x.trim() === '' ? null : x.trim());
    const row = {
      business_id: draft.business_id || null,
      customer_number: txt(draft.customer_number),
      job_name: txt(draft.job_name),
      job_number: txt(draft.job_number),
      phase_code: txt(draft.phase_code),
      job_address: txt(draft.job_address),
      pit_address: txt(draft.pit_address),
      material: txt(draft.material),
      pit_lat: num(draft.pit_lat),
      pit_lng: num(draft.pit_lng),
      job_lat: num(draft.job_lat),
      job_lng: num(draft.job_lng),
      geo_radius_m: Math.max(50, Math.round(num(draft.geo_radius_m) ?? DEFAULT_RADIUS_M)),
      start_date: draft.start_date || null,
      end_date: draft.end_date || null,
      start_time: txt(draft.start_time),
      stop_time: txt(draft.stop_time),
      travel_hours: num(draft.travel_hours),
      down_hours: num(draft.down_hours),
      rate: num(draft.rate),
      pay_rate: num(draft.pay_rate),
      rate_unit: draft.rate_unit || null,
      fuel_surcharge: num(draft.fuel_surcharge),
      fsr: txt(draft.fsr),
      tonnage: num(draft.tonnage),
      tonnage_type: draft.tonnage_type || null,
      equipment_type: txt(draft.equipment_type),
      unit_number: txt(draft.unit_number),
      status: draft.status,
      notes: txt(draft.notes),
    };

    const { data, error: err } = id
      ? await supabase.from('job_orders').update(row).eq('id', id).select('id').single()
      : await supabase.from('job_orders').insert(row).select('id').single();

    setBusy(false);
    if (err) { setError(err.message); return; }
    setMsg('Saved.');
    router.push(`/work-orders/orders/${data.id}`);
    router.refresh();
  }

  // Shown live so a pay rate above the bill rate is obvious while typing,
  // not after the first invoice.
  const margin = draft.rate.trim() !== '' && draft.pay_rate.trim() !== ''
    ? Number(draft.rate) - Number(draft.pay_rate)
    : null;

  const input = 'w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm';
  const label = 'block text-xs font-medium text-gray-600 mb-1';
  const card = 'bg-white border border-gray-200 rounded-lg p-4';

  // One address box with its pin: status line, look-up, map, clear.
  function pinBlock(which: 'pit' | 'job') {
    const addrKey = which === 'pit' ? 'pit_address' : 'job_address';
    const latKey = `${which}_lat`; const lngKey = `${which}_lng`;
    const lat = draft[latKey] !== '' ? Number(draft[latKey]) : null;
    const lng = draft[lngKey] !== '' ? Number(draft[lngKey]) : null;
    const pinned = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
    return (
      <div className="col-span-2 sm:col-span-3">
        <label><span className={label}>{which === 'pit' ? 'Load address (pit)' : 'Unload address (job)'}</span>
          <input
            value={draft[addrKey]}
            onChange={(e) => set(addrKey, e.target.value)}
            onBlur={() => locate(which, false)}
            className={input}
            placeholder={which === 'pit' ? 'Where the trucks load' : 'Where the trucks dump'}
          />
        </label>
        <div className="mt-1 flex items-center gap-3 flex-wrap text-[11px]">
          {pinned ? (
            <span className="text-emerald-700">
              Pinned ✓ {lat!.toFixed(5)}, {lng!.toFixed(5)} ·{' '}
              <a href={mapsUrl(`${lat},${lng}`)} target="_blank" rel="noopener noreferrer" className="underline">open map</a>
            </span>
          ) : (
            <span className="text-amber-700">Not pinned — GPS stamps can&apos;t be checked against this end.</span>
          )}
          <button type="button" onClick={() => locate(which, true)} disabled={geocoding === which || !draft[addrKey].trim()}
            className="text-brand-700 hover:underline disabled:opacity-50">
            {geocoding === which ? 'Finding…' : 'Find from address'}
          </button>
          <button type="button" onClick={() => setShowMap((m) => ({ ...m, [which]: !m[which] }))} className="text-brand-700 hover:underline">
            {showMap[which] ? 'Hide map' : (pinned ? 'Adjust on map' : 'Drop pin on map')}
          </button>
          {pinned && (
            <button type="button" onClick={() => setDraft((d) => ({ ...d, [latKey]: '', [lngKey]: '' }))} className="text-gray-500 hover:underline">
              Clear pin
            </button>
          )}
        </div>
        {geoMsg[which] && <p className="text-[11px] text-red-600 mt-0.5">{geoMsg[which]}</p>}
        {showMap[which] && (
          <div className="mt-2">
            <SitePinPicker
              lat={pinned ? lat : null}
              lng={pinned ? lng : null}
              radius={Number(draft.geo_radius_m) || DEFAULT_RADIUS_M}
              onPick={(la, lo) => setDraft((d) => ({ ...d, [latKey]: la.toFixed(6), [lngKey]: lo.toFixed(6) }))}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={card}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">The job</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="col-span-2 sm:col-span-3">
            <CustomerPicker value={draft.business_id} onChange={(id) => set('business_id', id)} />
          </div>
          <label><span className={label}>Customer #</span>
            <input value={draft.customer_number} onChange={(e) => set('customer_number', e.target.value)} className={input} />
          </label>
          <label className="col-span-1 sm:col-span-2"><span className={label}>Job name</span>
            <input value={draft.job_name} onChange={(e) => set('job_name', e.target.value)} className={input} />
          </label>
          <label><span className={label}>Job #</span>
            <input value={draft.job_number} onChange={(e) => set('job_number', e.target.value)} className={input} />
          </label>
          <label><span className={label}>Phase code</span>
            <input value={draft.phase_code} onChange={(e) => set('phase_code', e.target.value)} className={input} />
          </label>
          {pinBlock('pit')}
          {pinBlock('job')}
          <label><span className={label}>Match radius (meters)</span>
            <input type="number" min="50" step="50" inputMode="numeric" value={draft.geo_radius_m}
              onChange={(e) => set('geo_radius_m', e.target.value)} className={input} />
            <span className="block mt-1 text-[11px] text-gray-500">
              A stamp counts as on-site within this distance of the pin. 800 m (about half a mile) suits a pit or a big job; tighten it for a street address.
            </span>
          </label>
          <label className="col-span-2 sm:col-span-3"><span className={label}>Material</span>
            <input value={draft.material} onChange={(e) => set('material', e.target.value)} className={input} placeholder="e.g. XOUT, A1A, road base" />
          </label>
        </div>
      </div>

      <div className={card}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">How long it runs</h2>
        <p className="text-xs text-gray-500 mb-3">
          One day is the same date twice. A three-month job is the same two
          boxes, further apart.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label><span className={label}>Starts</span>
            <input
              type="date" value={draft.start_date}
              onChange={(e) => setDraft((d) => ({
                ...d,
                start_date: e.target.value,
                // Keep the range valid while they type rather than erroring later.
                end_date: d.end_date && d.end_date < e.target.value ? e.target.value : d.end_date,
              }))}
              className={input}
            />
          </label>
          <label><span className={label}>Ends</span>
            <input type="date" value={draft.end_date} min={draft.start_date}
              onChange={(e) => set('end_date', e.target.value)} className={input} />
          </label>
          <label><span className={label}>Daily start time</span>
            <input type="time" value={draft.start_time} onChange={(e) => set('start_time', e.target.value)} className={input} />
          </label>
          <label><span className={label}>Daily stop time</span>
            <input type="time" value={draft.stop_time} onChange={(e) => set('stop_time', e.target.value)} className={input} />
          </label>
        </div>
      </div>

      <div className={card}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">Agreed terms</h2>
        <p className="text-xs text-gray-500 mb-3">
          Tickets on this order start from these. Anything a ticket disagrees
          with gets flagged instead of billed quietly.
        </p>
        {margin !== null && (
          <p className={`text-xs mb-3 ${margin < 0 ? 'text-red-600 font-medium' : 'text-emerald-700'}`}>
            {margin < 0
              ? `You'd be paying $${Math.abs(margin).toFixed(2)} more than you bill.`
              : `Margin $${margin.toFixed(2)} per ${draft.rate_unit || 'hour'}.`}
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <label><span className={label}>Customer rate</span>
            <input type="number" step="0.01" min="0" inputMode="decimal" value={draft.rate}
              onChange={(e) => set('rate', e.target.value)} className={input} />
            <span className="block mt-1 text-[11px] text-gray-500">What you bill.</span>
          </label>
          <label><span className={label}>Hauler pay rate</span>
            <input type="number" step="0.01" min="0" inputMode="decimal" value={draft.pay_rate}
              onChange={(e) => set('pay_rate', e.target.value)} className={input} />
            <span className="block mt-1 text-[11px] text-gray-500">
              What a hauler is paid. They never see the customer rate.
            </span>
          </label>
          <label><span className={label}>Per</span>
            <select value={draft.rate_unit} onChange={(e) => set('rate_unit', e.target.value)} className={input}>
              {RATE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          {/* FSR sits with the money — it's who signs off on these numbers. */}
          <label><span className={label}>FSR</span>
            <input value={draft.fsr} onChange={(e) => set('fsr', e.target.value)} className={input} />
          </label>
          <label><span className={label}>Fuel surcharge ($)</span>
            <input type="number" step="0.01" min="0" inputMode="decimal" value={draft.fuel_surcharge}
              onChange={(e) => set('fuel_surcharge', e.target.value)} className={input} />
            <span className="block mt-1 text-[11px] text-gray-500">
              Shown at audit time so the checker has it in front of them.
            </span>
          </label>
          <label><span className={label}>Travel hours</span>
            <input type="number" step="0.25" min="0" inputMode="decimal" value={draft.travel_hours}
              onChange={(e) => set('travel_hours', e.target.value)} className={input} />
          </label>
          <label><span className={label}>Down time (hrs)</span>
            <input type="number" step="0.25" min="0" inputMode="decimal" value={draft.down_hours}
              onChange={(e) => set('down_hours', e.target.value)} className={input} />
          </label>
          <label><span className={label}>Tonnage (optional)</span>
            <input type="number" step="0.01" min="0" inputMode="decimal" value={draft.tonnage}
              onChange={(e) => set('tonnage', e.target.value)} className={input} />
            {draft.rate_unit !== 'ton' && draft.tonnage.trim() !== '' && (
              <span className="block mt-1 text-[11px] text-gray-500">
                Info only — this order bills per {draft.rate_unit || 'hour'}, so
                tonnage doesn&apos;t change the invoice.
              </span>
            )}
          </label>
          <label><span className={label}>Tonnage type</span>
            <select value={draft.tonnage_type} onChange={(e) => set('tonnage_type', e.target.value)} className={input}>
              {TONNAGE_TYPES.map((t) => <option key={t} value={t}>{t || '—'}</option>)}
            </select>
          </label>
          <label><span className={label}>Equipment type</span>
            <input value={draft.equipment_type} onChange={(e) => set('equipment_type', e.target.value)}
              className={input} list="order-equipment-types" />
            <datalist id="order-equipment-types">
              {EQUIPMENT_TYPES.map((t) => <option key={t} value={t} />)}
            </datalist>
          </label>
          <label><span className={label}>Unit # (truck)</span>
            <input value={draft.unit_number} onChange={(e) => set('unit_number', e.target.value)} className={input} />
          </label>
          <label><span className={label}>Status</span>
            <select value={draft.status} onChange={(e) => set('status', e.target.value)} className={input}>
              {ORDER_STATUSES.map((st) => <option key={st} value={st}>{ORDER_STATUS_LABEL[st]}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className={card}>
        <label><span className={label}>Notes</span>
          <textarea rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} className={input} />
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="px-4 py-2 text-sm rounded-md bg-brand-700 text-white font-medium hover:bg-brand-900 disabled:opacity-50"
        >
          {busy ? 'Saving…' : id ? 'Save order' : 'Create order'}
        </button>
        <button
          onClick={() => router.push('/work-orders/orders')}
          className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
