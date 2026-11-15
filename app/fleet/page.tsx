'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FLEET_ORIGIN } from '@/lib/fleet-embed';

// One Glovebox's fleet program, framed. Trip tracking needs the phone's
// location and receipt scanning needs the camera, so the frame is allowed
// both; it tells us when it has loaded so the spinner can go.

export default function FleetPage() {
  const [url, setUrl] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [height, setHeight] = useState<number>(600);
  const [error, setError] = useState('');
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    fetch('/api/fleet-embed', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) { setError(j.error || 'Could not load the fleet program.'); return; }
        setConfigured(!!j.configured);
        setUrl(j.url || null);
      })
      .catch(() => setError('Could not reach the server.'));
  }, []);

  // Fill everything under the nav bar, whatever height the nav takes on
  // this screen, and follow the keyboard/rotation.
  useEffect(() => {
    const fit = () => {
      const header = document.querySelector('header');
      const top = header ? header.getBoundingClientRect().bottom : 0;
      setHeight(Math.max(320, window.innerHeight - top));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === FLEET_ORIGIN && e.data && e.data.type === 'ogb:ready') setReady(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (error) return <p className="p-4 text-sm text-red-600">{error}</p>;
  if (configured === null) return <p className="p-4 text-sm text-gray-500">Loading…</p>;
  if (!configured || !url) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10 text-sm text-gray-700">
        <h1 className="text-2xl font-semibold mb-2">Fleet</h1>
        <p>
          The fleet program (trips, IFTA miles, fuel, receipts, maintenance, registrations,
          repairs, documents) isn&apos;t connected yet. An admin pastes the company&apos;s One
          Glovebox fleet ID under{' '}
          <Link href="/work-orders/setup" className="text-brand-700 hover:underline">Work Orders → Setup</Link>
          {' '}and it appears here.
        </p>
      </div>
    );
  }

  return (
    <div className="relative" style={{ height }}>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500 bg-gray-50">
          Loading the fleet program…
        </div>
      )}
      <iframe
        ref={frameRef}
        src={url}
        title="Fleet program"
        style={{ width: '100%', height: '100%', border: 0 }}
        allow="geolocation; camera; clipboard-write; web-share; fullscreen"
        className={ready ? '' : 'opacity-0'}
      />
    </div>
  );
}
