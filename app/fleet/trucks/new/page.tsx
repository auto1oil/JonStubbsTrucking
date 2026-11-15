'use client';
import TruckForm from '@/components/TruckForm';

export default function NewTruckPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-3">Add a truck</h1>
      <TruckForm truck={null} />
    </div>
  );
}
