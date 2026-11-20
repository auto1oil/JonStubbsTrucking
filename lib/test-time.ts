// Shared types and math for the Test tab (Trane Engineering). Pure — used
// by the screens and by the server route that builds the invoice, so the
// tally on the phone and the invoice always agree.

export type TestCustomer = {
  id: string; name: string; email: string | null; phone: string | null; address: string | null;
  qb_customer_id: string | null; active: boolean; created_at: string;
};
export type TestService = {
  id: string; name: string; rate: number; unit: 'hour' | 'each'; qb_item_id: string | null; active: boolean; sort: number;
};
export type TestEntry = {
  id: string; customer_id: string; service_id: string; user_id: string | null;
  clock_in_at: string; clock_out_at: string | null; notes: string | null; invoice_id: string | null; created_at: string;
};
export type TestInvoiceLine = { service_id: string; name: string; qty: number; unit: string; rate: number; amount: number; description: string };
export type TestInvoice = {
  id: string; customer_id: string; lines: TestInvoiceLine[]; total: number;
  status: 'draft' | 'invoiced' | 'sent' | 'failed'; qb_invoice_id: string | null; qb_doc_number: string | null;
  emailed_to: string | null; sent_at: string | null; error: string | null; created_at: string;
};

export const BUSINESS = {
  name: 'Trane Engineering',
  tagline: 'Civil engineering · Lehi, Utah',
};

// Hours between two instants, to two decimals.
export function entryHours(e: Pick<TestEntry, 'clock_in_at' | 'clock_out_at'>, now: number = Date.now()): number {
  const end = e.clock_out_at ? new Date(e.clock_out_at).getTime() : now;
  const ms = end - new Date(e.clock_in_at).getTime();
  return ms > 0 ? Math.round((ms / 3_600_000) * 100) / 100 : 0;
}

export const money = (n: number) => `$${n.toFixed(2)}`;

// 1:05:09 for the running clock.
export function hms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// One invoice line per service: hourly services bill the clocked hours at
// their rate; an "each" service bills one per visit.
export function buildLines(entries: TestEntry[], services: TestService[]): TestInvoiceLine[] {
  const byService = new Map<string, TestEntry[]>();
  for (const e of entries) {
    if (!e.clock_out_at) continue;
    byService.set(e.service_id, [...(byService.get(e.service_id) || []), e]);
  }
  const lines: TestInvoiceLine[] = [];
  for (const [serviceId, list] of byService) {
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) continue;
    const sorted = [...list].sort((a, b) => a.clock_in_at.localeCompare(b.clock_in_at));
    const qty = svc.unit === 'each'
      ? sorted.length
      : Math.round(sorted.reduce((n, e) => n + entryHours(e), 0) * 100) / 100;
    const rate = Number(svc.rate);
    lines.push({
      service_id: serviceId,
      name: svc.name,
      qty,
      unit: svc.unit === 'each' ? 'each' : 'hr',
      rate,
      amount: Math.round(qty * rate * 100) / 100,
      description: `${svc.name} — ${sorted.map((e) => `${day(e.clock_in_at)} ${time(e.clock_in_at)}–${time(e.clock_out_at!)}`).join('; ')}`,
    });
  }
  return lines;
}

export const linesTotal = (lines: TestInvoiceLine[]) => Math.round(lines.reduce((n, l) => n + l.amount, 0) * 100) / 100;
