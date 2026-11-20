'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { entryHours, hms, money, buildLines, linesTotal, type TestCustomer, type TestService, type TestEntry, type TestInvoice } from '@/lib/test-time';
import { invoiceMailto, invoiceNumber } from '@/lib/test-email';

// Log time: pick the customer and the service, tap Clock in when you get to
// the site, and the phone stays on a big running clock (the screen is kept
// awake) until you tap Clock out. The customer's unbilled time is tallied
// right underneath, with Send invoice.

type WakeLock = { release: () => Promise<void> };

const toLocal = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

export default function LogTimePage() {
  const supabase = createClient();
  const [me, setMe] = useState<string | null>(null);
  const [customers, setCustomers] = useState<TestCustomer[]>([]);
  const [services, setServices] = useState<TestService[]>([]);
  const [open, setOpen] = useState<TestEntry | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [unbilled, setUnbilled] = useState<TestEntry[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [adding, setAdding] = useState(false);
  const [nc, setNc] = useState({ name: '', email: '' });
  const [editId, setEditId] = useState<string | null>(null);
  // The invoice just created, with its Email-it link.
  const [made, setMade] = useState<TestInvoice | null>(null);
  const [edit, setEdit] = useState({ in: '', out: '' });
  const wake = useRef<WakeLock | null>(null);

  const loadBase = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setMe(user?.id ?? null);
    const [{ data: c }, { data: s }, { data: o }] = await Promise.all([
      supabase.from('test_customers').select('*').eq('active', true).order('name'),
      supabase.from('test_services').select('*').eq('active', true).order('sort').order('name'),
      user ? supabase.from('test_time_entries').select('*').eq('user_id', user.id).is('clock_out_at', null).order('clock_in_at', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const cs = (c as TestCustomer[]) || []; const ss = (s as TestService[]) || [];
    setCustomers(cs); setServices(ss);
    const openEntry = (o as TestEntry | null) ?? null;
    setOpen(openEntry);
    let last = ''; try { last = localStorage.getItem('trane-last-customer') || ''; } catch { /* fine */ }
    setCustomerId((cur) => openEntry?.customer_id || cur || (cs.some((x) => x.id === last) ? last : cs[0]?.id) || '');
    setServiceId((cur) => openEntry?.service_id || cur || ss[0]?.id || '');
  }, [supabase]);
  useEffect(() => { loadBase(); }, [loadBase]);

  const loadUnbilled = useCallback(async () => {
    if (!customerId) { setUnbilled([]); return; }
    const { data } = await supabase.from('test_time_entries').select('*').eq('customer_id', customerId).is('invoice_id', null).order('clock_in_at');
    setUnbilled((data as TestEntry[]) || []);
  }, [supabase, customerId]);
  useEffect(() => { loadUnbilled(); }, [loadUnbilled]);
  useEffect(() => { try { if (customerId) localStorage.setItem('trane-last-customer', customerId); } catch { /* fine */ } }, [customerId]);

  // The running clock, and keeping the screen on while clocked in.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    const lock = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } };
        if (nav.wakeLock && document.visibilityState === 'visible') wake.current = await nav.wakeLock.request('screen');
      } catch { /* not supported or denied — the clock still runs */ }
    };
    lock();
    const onVis = () => { if (document.visibilityState === 'visible') { setNow(Date.now()); lock(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); wake.current?.release().catch(() => null); wake.current = null; };
  }, [open]);

  async function addCustomer() {
    if (!nc.name.trim()) { setError('Give the customer a name.'); return; }
    const { data, error: err } = await supabase.from('test_customers').insert({ name: nc.name.trim(), email: nc.email.trim() || null }).select('*').single();
    if (err) { setError(err.message); return; }
    const c = data as TestCustomer;
    setCustomers((cs) => [...cs, c].sort((a, b) => a.name.localeCompare(b.name)));
    setCustomerId(c.id); setNc({ name: '', email: '' }); setAdding(false); setError('');
  }

  async function clockIn() {
    if (!customerId || !serviceId) { setError('Pick the customer and the service.'); return; }
    setBusy('in'); setError(''); setMsg('');
    const { data, error: err } = await supabase.from('test_time_entries')
      .insert({ customer_id: customerId, service_id: serviceId, user_id: me }).select('*').single();
    setBusy('');
    if (err) { setError(err.message); return; }
    setOpen(data as TestEntry); setNow(Date.now());
  }

  async function clockOut() {
    if (!open) return;
    setBusy('out'); setError('');
    const out = new Date().toISOString();
    const { data, error: err } = await supabase.from('test_time_entries').update({ clock_out_at: out }).eq('id', open.id).select('*').single();
    setBusy('');
    if (err) { setError(err.message); return; }
    const e = data as TestEntry;
    const svc = services.find((s) => s.id === e.service_id);
    const h = entryHours(e);
    setMsg(`Clocked out — ${h.toFixed(2)} h${svc ? ` of ${svc.name} · ${money(svc.unit === 'each' ? Number(svc.rate) : h * Number(svc.rate))}` : ''}.`);
    setOpen(null); loadUnbilled();
  }

  async function saveNotes(notes: string) {
    if (!open) return;
    await supabase.from('test_time_entries').update({ notes: notes.trim() || null }).eq('id', open.id);
  }

  async function saveEdit(id: string) {
    const inIso = edit.in ? new Date(edit.in).toISOString() : null;
    const outIso = edit.out ? new Date(edit.out).toISOString() : null;
    if (!inIso || (outIso && outIso <= inIso)) { setError('The clock-out has to be after the clock-in.'); return; }
    const { error: err } = await supabase.from('test_time_entries').update({ clock_in_at: inIso, clock_out_at: outIso }).eq('id', id);
    if (err) { setError(err.message); return; }
    setEditId(null); setError(''); loadUnbilled(); loadBase();
  }
  async function remove(id: string) {
    if (!window.confirm('Delete this time entry?')) return;
    await supabase.from('test_time_entries').delete().eq('id', id);
    loadUnbilled(); loadBase();
  }

  async function sendInvoice() {
    setBusy('send'); setError(''); setMsg(''); setMade(null);
    try {
      const res = await fetch('/api/test/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_id: customerId }) });
      const json = await res.json();
      if (!json.ok) { setError(json.error || 'Could not invoice.'); return; }
      setMade(json.invoice as TestInvoice);
      loadUnbilled();
    } catch {
      setError('No signal — try again.');
    } finally { setBusy(''); }
  }

  const cust = customers.find((c) => c.id === (open?.customer_id || customerId));
  const svc = services.find((s) => s.id === (open?.service_id || serviceId));
  const finished = unbilled.filter((e) => e.clock_out_at);
  const lines = buildLines(finished, services);
  const total = linesTotal(lines);
  const sel = 'w-full px-3 py-3 border border-gray-300 rounded-lg text-base bg-white';

  // ---- Clocked in: the whole screen is the clock ----
  if (open) {
    const ms = now - new Date(open.clock_in_at).getTime();
    const running = svc ? (svc.unit === 'each' ? Number(svc.rate) : (ms / 3_600_000) * Number(svc.rate)) : 0;
    return (
      <div className="flex flex-col items-center text-center pt-4 pb-10">
        <p className="text-sm text-gray-500">On site for</p>
        <p className="text-xl font-semibold mt-1">{cust?.name || 'Customer'}</p>
        <p className="text-sm text-gray-600">{svc?.name}{svc ? ` · ${money(Number(svc.rate))}/${svc.unit === 'each' ? 'visit' : 'hr'}` : ''}</p>
        <p className="font-mono tabular-nums text-6xl sm:text-7xl font-bold mt-8 text-slate-900">{hms(ms)}</p>
        <p className="text-lg text-emerald-700 font-semibold mt-2 tabular-nums">{money(running)}</p>
        <p className="text-xs text-gray-400 mt-1">Clocked in {clock(open.clock_in_at)} · the screen stays on</p>
        <textarea defaultValue={open.notes || ''} onBlur={(e) => saveNotes(e.target.value)} rows={2}
          placeholder="Notes for the invoice (optional)" className="mt-6 w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-base" />
        <button onClick={clockOut} disabled={busy === 'out'}
          className="mt-6 w-full max-w-md py-6 rounded-2xl bg-red-600 text-white text-2xl font-bold shadow-lg active:bg-red-700 disabled:opacity-60">
          {busy === 'out' ? 'Clocking out…' : 'Clock out'}
        </button>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>
    );
  }

  // ---- Not clocked in ----
  return (
    <div className="space-y-4 pb-10">
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Customer</span>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={sel}>
            {customers.length === 0 && <option value="">No customers yet — add one</option>}
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {adding ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
            <input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder="Customer name (e.g. Lehi City)" className={sel} />
            <input value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} placeholder="Email the invoice goes to" type="email" className={sel} />
            <div className="flex gap-2">
              <button onClick={addCustomer} className="px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium">Add customer</button>
              <button onClick={() => setAdding(false)} className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="text-sm text-slate-700 underline">+ New customer</button>
        )}
        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Service</span>
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={sel}>
            {services.length === 0 && <option value="">No services — add one on the Services tab</option>}
            {services.map((s) => <option key={s.id} value={s.id}>{s.name} — {money(Number(s.rate))}/{s.unit === 'each' ? 'visit' : 'hr'}</option>)}
          </select>
        </label>
        <button onClick={clockIn} disabled={busy === 'in' || !customerId || !serviceId}
          className="w-full py-6 rounded-2xl bg-emerald-600 text-white text-2xl font-bold shadow-lg active:bg-emerald-700 disabled:opacity-50">
          {busy === 'in' ? 'Clocking in…' : 'Clock in'}
        </button>
      </div>

      {msg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</p>}
      {made && (() => {
        const c = customers.find((x) => x.id === made.customer_id);
        return (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <p className="text-sm text-emerald-900 font-medium">Invoice {invoiceNumber(made)} — {money(Number(made.total))} for {c?.name}</p>
            {c?.email ? (
              <a href={invoiceMailto(made, c)} className="mt-3 block w-full text-center py-4 rounded-xl bg-emerald-700 text-white text-lg font-semibold">
                Email it to {c.email}
              </a>
            ) : (
              <p className="text-sm text-amber-800 mt-2">No email on file for this customer — <Link href="/test/customers" className="underline">add one</Link>, then email it from the Invoices tab.</p>
            )}
          </div>
        );
      })()}
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {cust && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">Not yet invoiced — {cust.name}</h2>
            {cust.email ? <span className="text-xs text-gray-500">{cust.email}</span> : <Link href="/test/customers" className="text-xs text-amber-700 underline">add an email to send</Link>}
          </div>
          {finished.length === 0 ? (
            <p className="text-sm text-gray-500 mt-2">No finished time yet.</p>
          ) : (
            <>
              <ul className="divide-y divide-gray-100 mt-2">
                {finished.map((e) => {
                  const s = services.find((x) => x.id === e.service_id);
                  return (
                    <li key={e.id} className="py-2 text-sm">
                      {editId === e.id ? (
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-xs text-gray-500">In<input type="datetime-local" value={edit.in} onChange={(x) => setEdit({ ...edit, in: x.target.value })} className="w-full border rounded px-2 py-2 text-sm" /></label>
                          <label className="text-xs text-gray-500">Out<input type="datetime-local" value={edit.out} onChange={(x) => setEdit({ ...edit, out: x.target.value })} className="w-full border rounded px-2 py-2 text-sm" /></label>
                          <div className="col-span-2 flex gap-3 text-xs">
                            <button onClick={() => saveEdit(e.id)} className="text-slate-900 font-medium underline">Save</button>
                            <button onClick={() => setEditId(null)} className="text-gray-500 underline">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between gap-3">
                          <span>
                            {day(e.clock_in_at)} · {clock(e.clock_in_at)}–{clock(e.clock_out_at!)} · {s?.name}
                            {e.notes && <span className="block text-xs text-gray-500">{e.notes}</span>}
                            <span className="block text-xs">
                              <button onClick={() => { setEditId(e.id); setEdit({ in: toLocal(e.clock_in_at), out: toLocal(e.clock_out_at) }); }} className="text-gray-500 underline">edit</button>
                              {' · '}<button onClick={() => remove(e.id)} className="text-gray-400 underline">delete</button>
                            </span>
                          </span>
                          <span className="tabular-nums shrink-0">{entryHours(e).toFixed(2)} h</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-gray-200 mt-2 pt-2 space-y-1 text-sm">
                {lines.map((l) => (
                  <div key={l.service_id} className="flex justify-between"><span>{l.name} · {l.qty} {l.unit} × {money(l.rate)}</span><span className="tabular-nums">{money(l.amount)}</span></div>
                ))}
                <div className="flex justify-between font-semibold text-base pt-1"><span>Total</span><span className="tabular-nums">{money(total)}</span></div>
              </div>
              <button onClick={sendInvoice} disabled={busy === 'send' || total <= 0}
                className="mt-3 w-full py-4 rounded-xl bg-slate-900 text-white text-lg font-semibold disabled:opacity-50">
                {busy === 'send' ? 'Creating…' : `Create invoice — ${money(total)}`}
              </button>
              <p className="text-[11px] text-gray-500 mt-1.5 text-center">Creates the invoice, then one tap emails it to {cust.email || 'the customer'} from your phone.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
