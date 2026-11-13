// The place check: does each GPS stamp on a ticket land where the order says
// the work happens? Load In / Load Out belong at the pit, Unload In / Unload
// Out at the job. The order carries both points (geocoded from its addresses
// or dropped on the map by the office) and a radius; everything here is pure
// so the ticket page, the audit queue and the PDF can all ask the same
// question and get the same answer.

import { LOAD_STAMPS, type WorkOrderLoad, type LoadStampKey } from '@/lib/work-orders';

export type OrderPins = {
  pit_lat: number | null;
  pit_lng: number | null;
  job_lat: number | null;
  job_lng: number | null;
  geo_radius_m: number | null;
};

export const DEFAULT_RADIUS_M = 800;

// Great-circle distance in metres.
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Feet under a mile, miles over — the way a dispatcher reads a distance.
export function fmtDistance(m: number): string {
  if (m < 1609.34) return `${Math.round(m * 3.28084)} ft`;
  return `${(m / 1609.34).toFixed(1)} mi`;
}

export type Expected = 'pit' | 'job';
export type StampStatus =
  | 'ok'        // inside the radius
  | 'off'       // a fix, but outside the radius
  | 'nofix'     // the phone gave no location with this stamp
  | 'unpinned'; // the order has no pin for this end, so nothing to measure

export type StampCheck = {
  load_no: number;
  key: LoadStampKey;
  label: string;
  at: string;
  lat: number | null;
  lng: number | null;
  expected: Expected;
  distance_m: number | null;
  status: StampStatus;
};

export type LocationReport = {
  stamps: StampCheck[];
  ok: number;
  off: number;
  nofix: number;
  unpinned: number;
  // Whether the order has at least one pin to measure against.
  checkable: boolean;
  summary: string;
  severity: 'none' | 'ok' | 'warn' | 'bad';
};

const EXPECTED_FOR: Record<LoadStampKey, Expected> = {
  load_in: 'pit', load_out: 'pit', unload_in: 'job', unload_out: 'job',
};

export const EXPECTED_LABEL: Record<Expected, string> = { pit: 'the pit', job: 'the job' };

function pinFor(pins: OrderPins | null, which: Expected): { lat: number; lng: number } | null {
  if (!pins) return null;
  const lat = which === 'pit' ? pins.pit_lat : pins.job_lat;
  const lng = which === 'pit' ? pins.pit_lng : pins.job_lng;
  return lat != null && lng != null ? { lat: Number(lat), lng: Number(lng) } : null;
}

export function checkTicketLocations(pins: OrderPins | null, loads: WorkOrderLoad[]): LocationReport {
  const radius = Number(pins?.geo_radius_m) > 0 ? Number(pins!.geo_radius_m) : DEFAULT_RADIUS_M;
  const stamps: StampCheck[] = [];
  for (const l of [...loads].sort((a, b) => a.load_no - b.load_no)) {
    for (const s of LOAD_STAMPS) {
      const at = l[`${s.key}_at`];
      if (!at) continue;
      const lat = l[`${s.key}_lat`];
      const lng = l[`${s.key}_lng`];
      const expected = EXPECTED_FOR[s.key];
      const pin = pinFor(pins, expected);
      let status: StampStatus;
      let distance_m: number | null = null;
      if (!pin) status = 'unpinned';
      else if (lat == null || lng == null) status = 'nofix';
      else {
        distance_m = distanceM(Number(lat), Number(lng), pin.lat, pin.lng);
        status = distance_m <= radius ? 'ok' : 'off';
      }
      stamps.push({ load_no: l.load_no, key: s.key, label: s.label, at, lat: lat == null ? null : Number(lat), lng: lng == null ? null : Number(lng), expected, distance_m, status });
    }
  }
  const count = (st: StampStatus) => stamps.filter((x) => x.status === st).length;
  const ok = count('ok'); const off = count('off'); const nofix = count('nofix'); const unpinned = count('unpinned');
  const checkable = !!(pinFor(pins, 'pit') || pinFor(pins, 'job'));

  let summary: string;
  let severity: LocationReport['severity'];
  if (stamps.length === 0) { summary = 'No GPS stamps on this ticket yet.'; severity = 'none'; }
  else if (!checkable) { summary = 'The order has no pins for the pit or the job, so the stamps can\'t be checked. Pin them on the order.'; severity = 'none'; }
  else if (off > 0) { summary = `${off} of ${stamps.length} stamps are off-site — not within ${fmtDistance(radius)} of the pit or the job.`; severity = 'bad'; }
  else if (nofix > 0) { summary = `${ok} stamps on-site · ${nofix} with no GPS fix to check.`; severity = 'warn'; }
  else if (unpinned > 0) { summary = `${ok} stamps on-site · ${unpinned} can't be checked (one end of the run isn't pinned on the order).`; severity = 'warn'; }
  else { summary = `All ${stamps.length} stamps at the pit and the job.`; severity = 'ok'; }

  return { stamps, ok, off, nofix, unpinned, checkable, summary, severity };
}
