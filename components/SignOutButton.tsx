'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

export default function SignOutButton({ className = '' }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        document.cookie = 'jst-keep=; Max-Age=0; path=/';
        await createClient().auth.signOut();
        router.push('/login');
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
