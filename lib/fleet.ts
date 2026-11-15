// The fleet program: the company's trucks and everything that happens to
// them — trips (and the IFTA miles by state they produce), fuel, receipts,
// maintenance, repairs, registrations and documents. All of it lives here,
// in this app's own tables, scoped the same way haul tickets are: the
// company's own fleet, or a hauling company's own trucks.

export type FleetTruck = {
  id: string;
  hauler_id: string | null;
  unit_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  plate: string | null;
  plate_state: string | null;
  odometer: number | null;
  active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const DOC_KINDS = [
  { key: 'registration', label: 'Registration' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'ifta_decal', label: 'IFTA decal / license' },
  { key: 'irp_cab_card', label: 'IRP cab card' },
  { key: 'annual_inspection', label: 'Annual DOT inspection' },
  { key: 'other', label: 'Other' },
] as const;
export type DocKind = (typeof DOC_KINDS)[number]['key'];

export type FleetDocument = {
  id: string;
  truck_id: string;
  hauler_id: string | null;
  kind: DocKind;
  number: string | null;
  issued_at: string | null;
  expires_at: string | null;
  file_path: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export const MAINTENANCE_KINDS = [
  { key: 'oil_change', label: 'Oil change', miles: 15000, days: 180 },
  { key: 'tires', label: 'Tires', miles: null, days: null },
  { key: 'brakes', label: 'Brakes', miles: null, days: null },
  { key: 'dot_annual', label: 'Annual DOT inspection', miles: null, days: 365 },
  { key: 'service', label: 'Service / PM', miles: 25000, days: 180 },
  { key: 'other', label: 'Other', miles: null, days: null },
] as const;
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number]['key'];

export type FleetMaintenance = {
  id: string;
  truck_id: string;
  hauler_id: string | null;
  kind: MaintenanceKind;
  done_at: string;
  odometer: number | null;
  cost: number | null;
  vendor: string | null;
  notes: string | null;
  next_due_at: string | null;
  next_due_odometer: number | null;
  file_path: string | null;
  created_by: string | null;
  created_at: string;
};

export const REPAIR_STATUSES = [
  { key: 'open', label: 'Reported' },
  { key: 'in_shop', label: 'In the shop' },
  { key: 'done', label: 'Fixed' },
] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number]['key'];

export type FleetRepair = {
  id: string;
  truck_id: string;
  hauler_id: string | null;
  reported_at: string;
  reported_by: string | null;
  description: string;
  status: RepairStatus;
  cost: number | null;
  done_at: string | null;
  vendor: string | null;
  notes: string | null;
  file_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FleetTrip = {
  id: string;
  truck_id: string;
  hauler_id: string | null;
  driver_id: string | null;
  started_at: string;
  ended_at: string | null;
  odometer_start: number | null;
  odometer_end: number | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  // Final miles: the odometer difference when both readings are in,
  // otherwise what the GPS breadcrumbs added up to.
  miles: number | null;
  gps_miles: number | null;
  // A trip typed in afterwards (no GPS): one state, so many miles.
  manual: boolean;
  state: string | null;
  notes: string | null;
  status: 'active' | 'ended';
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FleetTripState = { trip_id: string; state: string; miles: number };

export type FleetFuel = {
  id: string;
  truck_id: string;
  hauler_id: string | null;
  driver_id: string | null;
  at: string;
  gallons: number;
  total: number | null;
  odometer: number | null;
  state: string;
  vendor: string | null;
  file_path: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export const RECEIPT_CATEGORIES = [
  { key: 'toll', label: 'Toll' },
  { key: 'scale', label: 'Scale' },
  { key: 'parts', label: 'Parts' },
  { key: 'repair', label: 'Repair' },
  { key: 'lodging', label: 'Lodging' },
  { key: 'meals', label: 'Meals' },
  { key: 'supplies', label: 'Supplies' },
  { key: 'other', label: 'Other' },
] as const;
export type ReceiptCategory = (typeof RECEIPT_CATEGORIES)[number]['key'];

export type FleetReceipt = {
  id: string;
  truck_id: string | null;
  hauler_id: string | null;
  driver_id: string | null;
  at: string;
  amount: number;
  category: ReceiptCategory;
  vendor: string | null;
  file_path: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

// The bucket fleet photos and PDFs live in, and the folder that scopes them:
// a hauling company's id, or "company" for the company's own fleet.
export const FLEET_BUCKET = 'fleet-files';
export const fleetFolder = (haulerId: string | null) => haulerId || 'company';

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
];

// ---- Dates and due-ness ----------------------------------------------------
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function daysUntil(dateISO: string | null): number | null {
  if (!dateISO) return null;
  const d = new Date(dateISO + 'T00:00:00');
  const t = new Date(todayISO() + 'T00:00:00');
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

export type Due = { level: 'overdue' | 'soon' | 'ok' | 'none'; text: string };

// A document: expired, expiring within 30 days, or fine.
export function docDue(doc: Pick<FleetDocument, 'expires_at'>): Due {
  const n = daysUntil(doc.expires_at);
  if (n === null) return { level: 'none', text: 'no expiry' };
  if (n < 0) return { level: 'overdue', text: `expired ${-n} day${n === -1 ? '' : 's'} ago` };
  if (n === 0) return { level: 'overdue', text: 'expires today' };
  if (n <= 30) return { level: 'soon', text: `expires in ${n} day${n === 1 ? '' : 's'}` };
  return { level: 'ok', text: `expires ${doc.expires_at}` };
}

// Maintenance: due by date, or by the truck's latest odometer (within 500 mi).
export function maintenanceDue(m: Pick<FleetMaintenance, 'next_due_at' | 'next_due_odometer'>, truckOdometer: number | null): Due {
  const n = daysUntil(m.next_due_at);
  const milesLeft = m.next_due_odometer != null && truckOdometer != null ? m.next_due_odometer - truckOdometer : null;
  if ((n !== null && n < 0) || (milesLeft !== null && milesLeft < 0)) {
    return { level: 'overdue', text: milesLeft !== null && milesLeft < 0 ? `${-milesLeft} mi overdue` : `${-(n as number)} day${n === -1 ? '' : 's'} overdue` };
  }
  if ((n !== null && n <= 30) || (milesLeft !== null && milesLeft <= 500)) {
    return { level: 'soon', text: milesLeft !== null && milesLeft <= 500 ? `due in ${milesLeft} mi` : `due in ${n} day${n === 1 ? '' : 's'}` };
  }
  if (n === null && milesLeft === null) return { level: 'none', text: 'no next due set' };
  return { level: 'ok', text: milesLeft !== null ? `due in ${milesLeft} mi` : `due ${m.next_due_at}` };
}

// IFTA quarters: "2026-Q3" → the dates it covers.
export function quarterBounds(q: string): { start: string; end: string } {
  const [y, qn] = q.split('-Q').map(Number);
  const startMonth = (qn - 1) * 3;
  const start = new Date(y, startMonth, 1);
  const end = new Date(y, startMonth + 3, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: iso(start), end: iso(end) };
}
export function currentQuarter(): string {
  const d = new Date();
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}
export function recentQuarters(n = 8): string[] {
  const out: string[] = [];
  const d = new Date();
  let y = d.getFullYear(); let q = Math.floor(d.getMonth() / 3) + 1;
  for (let i = 0; i < n; i++) {
    out.push(`${y}-Q${q}`);
    q -= 1; if (q === 0) { q = 4; y -= 1; }
  }
  return out;
}

export const money = (n: number | null | undefined) => (n == null ? '' : `$${Number(n).toFixed(2)}`);
