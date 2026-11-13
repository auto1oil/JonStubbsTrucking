'use client';
import { checkTicketLocations, fmtDistance, EXPECTED_LABEL, type OrderPins } from '@/lib/location-check';
import { mapsUrl } from '@/lib/maps';
import type { WorkOrderLoad } from '@/lib/work-orders';

// The place check, rendered. One line of verdict, then every stamp with how
// far it was from where the order says it should have been, and a map link
// so the office can see for itself. `compact` keeps just the verdict and
// the stamps that aren't fine — for the audit queue's verify panel.

const TONE = {
  none: 'bg-gray-50 border-gray-200 text-gray-600',
  ok: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  warn: 'bg-amber-50 border-amber-200 text-amber-900',
  bad: 'bg-red-50 border-red-200 text-red-800',
};
const BADGE = {
  ok: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  off: 'bg-red-100 text-red-800 border-red-200',
  nofix: 'bg-gray-100 text-gray-600 border-gray-200',
  unpinned: 'bg-gray-100 text-gray-600 border-gray-200',
};
const WORD = { ok: 'on-site', off: 'OFF-SITE', nofix: 'no fix', unpinned: 'not pinned' };

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function LocationCheck({ pins, loads, compact = false }: {
  pins: OrderPins | null; loads: WorkOrderLoad[]; compact?: boolean;
}) {
  const r = checkTicketLocations(pins, loads);
  const rows = compact ? r.stamps.filter((s) => s.status !== 'ok') : r.stamps;
  const pinLink = (which: 'pit' | 'job') => {
    const lat = which === 'pit' ? pins?.pit_lat : pins?.job_lat;
    const lng = which === 'pit' ? pins?.pit_lng : pins?.job_lng;
    return lat != null && lng != null ? mapsUrl(`${lat},${lng}`) : null;
  };

  return (
    <div className={`rounded-md border px-3 py-2 ${TONE[r.severity]}`}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-sm font-medium">
          {r.severity === 'bad' ? '⚠ ' : r.severity === 'ok' ? '✓ ' : ''}Location check — {r.summary}
        </span>
        {r.checkable && (
          <span className="text-[11px] opacity-80">
            {pinLink('pit') && <a href={pinLink('pit')!} target="_blank" rel="noopener noreferrer" className="underline">pit pin</a>}
            {pinLink('pit') && pinLink('job') && ' · '}
            {pinLink('job') && <a href={pinLink('job')!} target="_blank" rel="noopener noreferrer" className="underline">job pin</a>}
          </span>
        )}
      </div>
      {rows.length > 0 && (
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-left opacity-70">
              <th className="pr-2 font-medium">Load</th>
              <th className="pr-2 font-medium">Stamp</th>
              <th className="pr-2 font-medium">Time</th>
              <th className="pr-2 font-medium">Should be at</th>
              <th className="pr-2 font-medium">Was</th>
              <th className="font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={`${s.load_no}-${s.key}`} className="border-t border-black/5">
                <td className="pr-2 py-0.5 tabular-nums">{s.load_no}</td>
                <td className="pr-2 py-0.5">{s.label}</td>
                <td className="pr-2 py-0.5 tabular-nums">{clock(s.at)}</td>
                <td className="pr-2 py-0.5">{EXPECTED_LABEL[s.expected]}</td>
                <td className="pr-2 py-0.5">
                  <span className={`inline-block px-1.5 py-0.5 rounded border font-medium ${BADGE[s.status]}`}>
                    {WORD[s.status]}
                  </span>
                  {s.distance_m != null && <span className="ml-1 tabular-nums">{fmtDistance(s.distance_m)} away</span>}
                </td>
                <td className="py-0.5 text-right">
                  {s.lat != null && s.lng != null && (
                    <a href={mapsUrl(`${s.lat},${s.lng}`)} target="_blank" rel="noopener noreferrer" className="underline">map</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
