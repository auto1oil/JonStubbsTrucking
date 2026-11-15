'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// The fleet program's own tabs, under the main nav.
const TABS = [
  { href: '/fleet', label: 'Trucks' },
  { href: '/fleet/trip', label: 'Trip' },
  { href: '/fleet/fuel', label: 'Fuel' },
  { href: '/fleet/receipts', label: 'Receipts' },
  { href: '/fleet/ifta', label: 'IFTA' },
];

export default function FleetNav() {
  const pathname = usePathname() || '';
  return (
    <div className="flex gap-1 overflow-x-auto scrollbar-hide mb-4 -mx-1 px-1">
      {TABS.map((t) => {
        const active = t.href === '/fleet' ? pathname === '/fleet' || pathname.startsWith('/fleet/trucks') : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap min-h-[44px] inline-flex items-center ${
              active ? 'bg-brand-700 text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
