// Emailing an invoice from the phone until QuickBooks is in: a mailto link
// with the invoice laid out as text, addressed to the customer. The phone's
// mail app sends it from the user's own account.

import { money, type TestInvoice, type TestCustomer } from '@/lib/test-time';

export const TRANE = {
  legalName: 'Trane Engineering, P.C.',
  address: '27 E Main St, Lehi, UT 84043',
  phone: '(801) 768-4544',
  fax: '(801) 768-3733',
  website: 'trane-eng.com',
};

export function invoiceNumber(inv: Pick<TestInvoice, 'id' | 'created_at' | 'qb_doc_number'>): string {
  if (inv.qb_doc_number) return inv.qb_doc_number;
  const d = new Date(inv.created_at);
  return `TE-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${inv.id.slice(0, 4).toUpperCase()}`;
}

export function invoiceMailto(inv: TestInvoice, cust: Pick<TestCustomer, 'name' | 'email'>): string {
  const no = invoiceNumber(inv);
  const lines = inv.lines.map((l) => `${l.name}: ${l.qty} ${l.unit} × ${money(l.rate)} = ${money(l.amount)}\n   ${l.description.replace(/^[^—]*— /, '')}`);
  const body = [
    `${cust.name},`,
    '',
    `Here is invoice ${no} from ${TRANE.legalName}.`,
    '',
    ...lines,
    '',
    `Total due: ${money(Number(inv.total))}`,
    '',
    'Thank you for your business.',
    '',
    TRANE.legalName,
    TRANE.address,
    `Phone ${TRANE.phone} · Fax ${TRANE.fax}`,
    TRANE.website,
  ].join('\n');
  return `mailto:${encodeURIComponent(cust.email || '')}?subject=${encodeURIComponent(`Invoice ${no} — ${TRANE.legalName}`)}&body=${encodeURIComponent(body)}`;
}
