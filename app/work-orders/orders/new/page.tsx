'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import OrderForm from '@/components/OrderForm';
import type { JobOrder } from '@/lib/job-orders';

// Create an order, or copy one: ?from=<order id> starts the form filled in
// from that order with today's dates, for the repeat job that would
// otherwise be retyped.

function NewOrderInner() {
  const params = useSearchParams();
  const from = params.get('from');
  const [template, setTemplate] = useState<JobOrder | null>(null);
  const [ready, setReady] = useState(!from);

  useEffect(() => {
    if (!from) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.from('job_orders').select('*').eq('id', from).maybeSingle();
      setTemplate((data as JobOrder | null) ?? null);
      setReady(true);
    })();
  }, [from]);

  return (
    <div>
      <Link href="/work-orders/orders" className="text-sm text-brand-700 hover:underline">← Orders</Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">{template ? `Copy of order #${template.order_number}` : 'Create order'}</h1>
      <p className="text-sm text-gray-600 mb-4">
        {template
          ? 'Everything from the original is filled in with today’s dates. Change what differs and save; the original is untouched.'
          : 'An order is a specific job. Tickets and hauler dispatches all point at one, so this is what an invoice gets checked against.'}
      </p>
      {ready ? <OrderForm order={null} template={template} /> : <p className="text-sm text-gray-500">Loading the order to copy…</p>}
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
      <NewOrderInner />
    </Suspense>
  );
}
