'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { fleetFolder, type FleetTruck } from '@/lib/fleet';

// Who is using the fleet program: their id, their company (null for the
// company's own fleet), whether they're staff, and the storage folder their
// photos go in.
export type FleetScope = { userId: string | null; haulerId: string | null; isStaff: boolean; folder: string; name: string };

export function useFleetScope(): FleetScope | null {
  const [scope, setScope] = useState<FleetScope | null>(null);
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setScope({ userId: null, haulerId: null, isStaff: false, folder: 'company', name: '' }); return; }
      const { data: me } = await supabase.from('profiles').select('role, hauler_id, full_name, email').eq('id', user.id).single();
      const haulerId = (me?.hauler_id as string | null) ?? null;
      setScope({
        userId: user.id,
        haulerId,
        isStaff: ['office', 'admin', 'master_admin'].includes(me?.role || ''),
        folder: fleetFolder(haulerId),
        name: (me?.full_name as string | null) || (me?.email as string) || '',
      });
    })();
  }, []);
  return scope;
}

// The company's trucks, active first, for pickers.
export function useTrucks(): { trucks: FleetTruck[]; loading: boolean; reload: () => Promise<void> } {
  const [trucks, setTrucks] = useState<FleetTruck[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = async () => {
    const supabase = createClient();
    const { data } = await supabase.from('fleet_trucks').select('*').order('active', { ascending: false }).order('unit_number');
    setTrucks((data as FleetTruck[]) || []);
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);
  return { trucks, loading, reload };
}

export const truckLabel = (t: Pick<FleetTruck, 'unit_number' | 'make' | 'model' | 'year'> | undefined | null) =>
  t ? [`Unit ${t.unit_number}`, [t.year, t.make, t.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ') : '';

// Form helpers shared by the fleet screens.
export const fInput = 'w-full px-2.5 py-2 border border-gray-300 rounded-md text-sm';
export const fLabel = 'block text-xs font-medium text-gray-600 mb-1';
export const fCard = 'bg-white border border-gray-200 rounded-lg p-4';
export const fBtn = 'px-4 py-2.5 text-sm bg-brand-700 text-white rounded-md hover:bg-brand-900 disabled:opacity-50 font-medium min-h-[44px]';
export const fBtnGhost = 'px-4 py-2.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 min-h-[44px]';
export const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));
export const txtOrNull = (v: string) => (v.trim() === '' ? null : v.trim());
