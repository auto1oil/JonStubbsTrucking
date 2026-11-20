'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/test/log', label: 'Log time' },
  { href: '/test/invoices', label: 'Invoices' },
  { href: '/test/services', label: 'Services' },
  { href: '/test/customers', label: 'Customers' },
  { href: '/test/website', label: 'Website' },
];

export default function TestNav() {
  const pathname = usePathname() || '';
  return (
    <nav className="max-w-3xl mx-auto px-2 flex gap-1 overflow-x-auto scrollbar-hide">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href}
            className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 ${active ? 'border-amber-400 text-white' : 'border-transparent text-slate-300 hover:text-white'}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
