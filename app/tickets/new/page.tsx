'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import WorkOrderForm from '@/components/WorkOrderForm';

// Opening New Ticket starts the ticket. The draft is created straight away
// and the driver lands on it with the load lines and the stamp button ready,
// instead of filling a form and saving before anything can be tapped. A
// draft started by mistake has a Discard button on it.

export default function NewTicketPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/work-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_date: new Date().toISOString().slice(0, 10) }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (json.ok && json.work_order?.id) { router.replace(`/tickets/${json.work_order.id}`); return; }
        setFailed(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  if (!failed) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-1">New field ticket</h1>
        <p className="text-sm text-gray-500">Starting your ticket…</p>
      </div>
    );
  }
  // No signal, or no permission: fall back to the plain form, which saves
  // when it can.
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">New field ticket</h1>
      <p className="text-sm text-gray-500 mb-4">
        Couldn&apos;t start the ticket on the server just now. Fill it in here and press Save draft when you have signal.
      </p>
      <WorkOrderForm workOrder={null} />
    </div>
  );
}
