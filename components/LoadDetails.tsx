import AddressLink from '@/components/AddressLink';
import type { HaulerLoad, HaulerEquipment } from '@/lib/haulers';

// Everything the office put on a load, laid out so a hauler can read the job
// before taking it: where to load, where it goes, what it is, when, and what
// it pays. Addresses open in the map. Blank fields are left out.
export default function LoadDetails({ load, unit }: { load: HaulerLoad; unit?: HaulerEquipment | null }) {
  const rows: [string, React.ReactNode][] = [
    ['Job', [load.job_number ? `Job ${load.job_number}` : null, load.job_name].filter(Boolean).join(' · ') || null],
    ['Phase', load.phase_code],
    ['Date', load.job_date],
    ['Start time', load.start_time],
    ['Load address (pit)', <AddressLink key="p" address={load.pickup} />],
    ['Unload address (job)', <AddressLink key="d" address={load.dropoff} />],
    ['Material', load.material],
    ['Truck', unit ? `Unit ${unit.unit_number || ''}`.trim() : load.equipment_type],
    ['Pays', load.rate != null ? `$${Number(load.rate).toFixed(2)} per ${load.rate_unit || 'hour'}` : null],
  ];
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
  return (
    <div className="mt-2">
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-sm">
        {shown.map(([k, v]) => (
          <div key={k} className={k.endsWith('address (pit)') || k.endsWith('address (job)') ? 'col-span-2 sm:col-span-3' : ''}>
            <dt className="text-[11px] text-gray-500">{k}</dt>
            <dd className="text-gray-900">{v}</dd>
          </div>
        ))}
      </dl>
      {load.notes && (
        <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900 whitespace-pre-wrap">
          <span className="block text-[11px] uppercase tracking-wide text-amber-700 mb-0.5">Notes from dispatch</span>
          {load.notes}
        </div>
      )}
    </div>
  );
}
