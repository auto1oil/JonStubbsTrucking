'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// How a hauler wants a ticket paid: Standard Pay, or Factor Payment through
// Auto 1 Funding. Factor only exists once the company's funding link is
// active, and completing a factor ticket needs the funding app's bill of
// sale signed — this fetches it, opens it, and re-checks when the tab comes
// back into focus so the green line appears without a refresh.

type Bos = { url: string; accepted: boolean; accepted_by: string | null; accepted_at: string | null };

export default function PaymentMethod({ id, locked, value, onChange, factorAllowed, bosResetAt }: {
  id: string | null;
  locked: boolean;
  value: string;
  onChange: (v: 'standard' | 'factor') => void;
  factorAllowed: boolean;
  bosResetAt: string | null;
}) {
  const [bos, setBos] = useState<Bos | null>(null);
  const [bosBusy, setBosBusy] = useState(false);
  const [bosError, setBosError] = useState('');

  // Fetch (and optionally open) the bill of sale. Idempotent server-side, so
  // calling again is how we poll for the signature. Tab opens before the
  // await — Safari blocks a window.open that comes after one.
  async function loadBos(open: boolean) {
    if (!id) return;
    setBosBusy(true); setBosError('');
    const tab = open ? window.open('about:blank', '_blank') : null;
    try {
      const res = await fetch(`/api/work-orders/${id}/bill-of-sale`, { method: 'POST' });
      const json = await res.json();
      if (!json.ok || !json.url) { tab?.close(); setBosError(json.error || 'Could not get the bill of sale.'); return; }
      setBos({ url: json.url, accepted: !!json.accepted, accepted_by: json.accepted_by ?? null, accepted_at: json.accepted_at ?? null });
      if (tab) tab.location.href = json.url;
    } catch {
      tab?.close();
      setBosError('Network error — try again.');
    } finally {
      setBosBusy(false);
    }
  }

  useEffect(() => {
    if (value !== 'factor' || !id) return;
    if (!bos) loadBos(false);
    const onFocus = () => loadBos(false);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, id]);

  // The signature stops counting once the office sends the ticket back —
  // the refreshed bill of sale has to be agreed to again.
  const bosStale = !!(bos?.accepted && bosResetAt && (!bos.accepted_at || new Date(bos.accepted_at) <= new Date(bosResetAt)));

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-1">How do you want this ticket paid?</h2>
      <p className="text-xs text-gray-500 mb-3">
        Factor Payment sends the approved ticket straight to the factoring service to fund. Standard Pay stays on the normal pay run.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(factorAllowed ? ([['standard', 'Standard Pay'], ['factor', 'Factor Payment']] as const) : ([['standard', 'Standard Pay']] as const)).map(([v, title]) => (
          <button
            key={v} type="button" disabled={locked} onClick={() => onChange(v)}
            className={`px-3 py-2.5 rounded-md border text-sm font-medium disabled:opacity-50 min-h-[44px] ${
              (value || 'standard') === v ? 'border-brand-700 bg-brand-700 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {title}
          </button>
        ))}
      </div>
      {!factorAllowed && (
        <p className="mt-2 text-[11px] text-gray-500">
          Factor Payment shows up here once your Auto 1 Funding account is linked and approved — request it under{' '}
          <Link href="/hauler/company" className="text-brand-700 hover:underline">Company</Link>.
        </p>
      )}
      {value === 'factor' && (
        !id ? (
          <p className="mt-3 text-xs text-gray-500">Save the draft once and the bill of sale to sign appears here.</p>
        ) : bos?.accepted && !bosStale ? (
          <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Bill of sale signed{bos.accepted_by ? ` by ${bos.accepted_by}` : ''}{bos.accepted_at ? ` · ${new Date(bos.accepted_at).toLocaleString()}` : ''}.
          </p>
        ) : (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-sm text-amber-900">
              {bosStale
                ? 'The office sent this ticket back, so the amounts changed. The refreshed bill of sale needs to be signed again before completing.'
                : 'The factoring company’s bill of sale needs your signature before this ticket can be completed. It reflects the last saved numbers.'}
            </p>
            <div className="flex gap-2 mt-2 flex-wrap">
              <button type="button" onClick={() => loadBos(true)} disabled={bosBusy} className="px-3 py-2 text-sm rounded-md bg-brand-700 text-white font-medium hover:bg-brand-900 disabled:opacity-50 min-h-[44px]">
                {bosBusy ? 'Working…' : 'Open & sign the bill of sale'}
              </button>
              <button type="button" onClick={() => loadBos(false)} disabled={bosBusy} className="px-3 py-2 text-sm rounded-md border border-gray-300 hover:bg-white disabled:opacity-50 min-h-[44px]">
                I signed it — check again
              </button>
            </div>
            {bosError && <p className="text-xs text-red-600 mt-1.5">{bosError}</p>}
          </div>
        )
      )}
    </div>
  );
}
