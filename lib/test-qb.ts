// Trane Engineering's own QuickBooks connection, for the Test tab.
//
// Deliberately separate from lib/quickbooks.ts, which is Jon Stubbs
// Trucking's books (quickbooks_connection id=1). This one lives in
// test_qb_connection and defaults to a QuickBooks *sandbox* company, so test
// invoices never land in a real ledger. It can use its own Intuit keys
// (TEST_QUICKBOOKS_CLIENT_ID / _SECRET — the app's Development keys, which
// are what sandbox companies accept) and falls back to the main ones.

import { createAdminClient } from '@/lib/supabase-admin';

const AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const MINOR = 'minorversion=75';

export const testQbEnv = (): 'sandbox' | 'production' =>
  process.env.TEST_QUICKBOOKS_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
const clientId = () => process.env.TEST_QUICKBOOKS_CLIENT_ID || process.env.QUICKBOOKS_CLIENT_ID || '';
const clientSecret = () => process.env.TEST_QUICKBOOKS_CLIENT_SECRET || process.env.QUICKBOOKS_CLIENT_SECRET || '';
export const testRedirectUri = () =>
  process.env.TEST_QUICKBOOKS_REDIRECT_URI
  || `${(process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')}/api/test/quickbooks/callback`;
export const testQbConfigured = () => !!(clientId() && clientSecret());

const apiBase = (env: 'sandbox' | 'production', realm: string) =>
  `${env === 'production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com'}/v3/company/${realm}`;

export function testAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: clientId(), scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: testRedirectUri(), response_type: 'code', state,
  });
  return `${AUTHORIZE_URL}?${p.toString()}`;
}

async function tokenRequest(body: URLSearchParams): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(), signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`QuickBooks sign-in failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function testExchangeCode(code: string, realmId: string) {
  const t = await tokenRequest(new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: testRedirectUri() }));
  const now = Date.now();
  const { error } = await createAdminClient().from('test_qb_connection').upsert({
    id: 1, realm_id: realmId, access_token: t.access_token, refresh_token: t.refresh_token,
    access_token_expires_at: new Date(now + t.expires_in * 1000).toISOString(),
    environment: testQbEnv(), connected_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(),
  });
  if (error) throw new Error(error.message);
}

type Conn = { realm_id: string; access_token: string | null; refresh_token: string; access_token_expires_at: string | null; environment: 'sandbox' | 'production' };

export async function testQbStatus(): Promise<{ connected: boolean; environment: string; realm: string | null; connected_at: string | null }> {
  const { data } = await createAdminClient().from('test_qb_connection').select('realm_id, environment, connected_at, refresh_token').eq('id', 1).maybeSingle();
  const r = data as { realm_id: string | null; environment: string; connected_at: string | null; refresh_token: string | null } | null;
  return { connected: !!(r?.realm_id && r.refresh_token), environment: r?.environment || testQbEnv(), realm: r?.realm_id ?? null, connected_at: r?.connected_at ?? null };
}

// A current access token, refreshed when it's about to lapse. The refresh is
// a compare-and-swap on the old refresh token, so two refreshes at once can't
// leave the stored token stale.
async function getAccess(): Promise<{ token: string; base: string }> {
  const db = createAdminClient();
  const { data } = await db.from('test_qb_connection').select('*').eq('id', 1).maybeSingle();
  const c = data as Conn | null;
  if (!c?.realm_id || !c.refresh_token) throw new Error('The Trane Engineering QuickBooks company isn’t connected yet — connect it on the Invoices tab.');
  const fresh = c.access_token && c.access_token_expires_at && new Date(c.access_token_expires_at).getTime() - Date.now() > 60_000;
  if (fresh) return { token: c.access_token!, base: apiBase(c.environment, c.realm_id) };
  const t = await tokenRequest(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refresh_token }));
  await db.from('test_qb_connection').update({
    access_token: t.access_token, refresh_token: t.refresh_token,
    access_token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', 1).eq('refresh_token', c.refresh_token);
  return { token: t.access_token, base: apiBase(c.environment, c.realm_id) };
}

async function qb<T>(path: string, init?: { method?: string; body?: unknown; octet?: boolean }): Promise<T> {
  const { token, base } = await getAccess();
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${base}${path}${sep}${MINOR}`, {
    method: init?.method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/json',
      ...(init?.octet ? { 'Content-Type': 'application/octet-stream' } : init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { Fault?: { Error?: { Message?: string; Detail?: string }[] } };
      const e = j.Fault?.Error?.[0]; if (e) msg = [e.Message, e.Detail].filter(Boolean).join(' — ');
    } catch { /* keep raw */ }
    throw new Error(`QuickBooks answered ${res.status}: ${msg}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
async function query<T>(sql: string): Promise<T[]> {
  const r = await qb<{ QueryResponse: Record<string, T[]> }>(`/query?query=${encodeURIComponent(sql)}`);
  const vals = Object.values(r.QueryResponse || {}).find(Array.isArray);
  return (vals as T[]) || [];
}

// The customer in QuickBooks: found by name, else created with the email
// the invoice will go to.
export async function ensureQbCustomer(c: { name: string; email: string | null; phone: string | null; address: string | null }): Promise<string> {
  const found = await query<{ Id: string }>(`select Id from Customer where DisplayName = '${q(c.name)}'`);
  if (found[0]) return found[0].Id;
  const r = await qb<{ Customer: { Id: string } }>('/customer', {
    method: 'POST',
    body: {
      DisplayName: c.name,
      ...(c.email ? { PrimaryEmailAddr: { Address: c.email } } : {}),
      ...(c.phone ? { PrimaryPhone: { FreeFormNumber: c.phone } } : {}),
      ...(c.address ? { BillAddr: { Line1: c.address } } : {}),
    },
  });
  return r.Customer.Id;
}

// The service as a QuickBooks item: found by name, else created as a Service
// item against the first income account.
export async function ensureQbItem(s: { name: string; rate: number }): Promise<string> {
  const found = await query<{ Id: string }>(`select Id from Item where Name = '${q(s.name)}'`);
  if (found[0]) return found[0].Id;
  const acct = (await query<{ Id: string }>("select Id from Account where AccountType = 'Income' maxresults 1"))[0];
  if (!acct) throw new Error('The QuickBooks company has no income account to put services against.');
  const r = await qb<{ Item: { Id: string } }>('/item', {
    method: 'POST', body: { Name: s.name.slice(0, 100), Type: 'Service', UnitPrice: s.rate, IncomeAccountRef: { value: acct.Id } },
  });
  return r.Item.Id;
}

export async function createQbInvoice(opts: {
  customerId: string; email: string | null;
  lines: { itemId: string; name: string; qty: number; rate: number; amount: number; description: string }[];
}): Promise<{ Id: string; DocNumber?: string }> {
  const r = await qb<{ Invoice: { Id: string; DocNumber?: string } }>('/invoice', {
    method: 'POST',
    body: {
      CustomerRef: { value: opts.customerId },
      Line: opts.lines.map((l) => ({
        DetailType: 'SalesItemLineDetail', Amount: l.amount, Description: l.description.slice(0, 4000),
        SalesItemLineDetail: { ItemRef: { value: l.itemId, name: l.name }, Qty: l.qty, UnitPrice: l.rate },
      })),
      ...(opts.email ? { BillEmail: { Address: opts.email }, EmailStatus: 'NeedToSend' } : {}),
      CustomerMemo: { value: 'Thank you for your business. — Trane Engineering' },
    },
  });
  return r.Invoice;
}

// QuickBooks emails the invoice (with its PDF and a pay link if Payments is
// on) to the address given.
export async function emailQbInvoice(invoiceId: string, email: string): Promise<void> {
  await qb(`/invoice/${invoiceId}/send?sendTo=${encodeURIComponent(email)}`, { method: 'POST', octet: true });
}
