import { mapsUrl } from '@/lib/maps';

// An address that opens in the map when tapped. Renders nothing for a blank
// one so callers can pass whatever the row holds.
export default function AddressLink({ address, className = '' }: { address: string | null | undefined; className?: string }) {
  const a = (address || '').trim();
  if (!a) return null;
  return (
    <a
      href={mapsUrl(a)}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-brand-700 hover:underline ${className}`}
      title="Open in Maps"
    >
      {a} <span aria-hidden className="text-[10px] align-middle">↗</span>
    </a>
  );
}
