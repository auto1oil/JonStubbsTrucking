'use client';
import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { maybeCompressImage } from '@/lib/image-compress';

// A photo spot on the mock Trane website. Empty, it says what belongs there
// and opens the camera roll on tap; filled, it shows the photo with a small
// "Change photo" button. Uploads go straight from the phone to the public
// 'test-site' bucket, then the spot's row in test_site_content is updated.

export const SITE_BUCKET = 'test-site';

export function sitePhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return createClient().storage.from(SITE_BUCKET).getPublicUrl(path).data.publicUrl;
}

export default function SitePhoto({ slot, path, label, className = '', dark = false, onSaved }: {
  slot: string;
  path: string | null | undefined;
  label: string;
  className?: string;
  dark?: boolean;
  onSaved: (slot: string, path: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const url = sitePhotoUrl(path);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    e.target.value = '';
    if (!raw) return;
    setBusy(true); setError('');
    try {
      const file = await maybeCompressImage(raw);
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const newPath = `${slot}-${Date.now()}.${ext}`;
      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from(SITE_BUCKET).upload(newPath, file, { contentType: file.type || 'image/jpeg' });
      if (upErr) throw new Error(upErr.message);
      const { error: rowErr } = await supabase.from('test_site_content')
        .upsert({ slot, photo_path: newPath, updated_at: new Date().toISOString() }, { onConflict: 'slot' });
      if (rowErr) throw new Error(rowErr.message);
      if (path) supabase.storage.from(SITE_BUCKET).remove([path]).then(() => {}, () => {});
      onSaved(slot, newPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(/bucket|not found|relation|does not exist/i.test(msg)
        ? 'Photos aren’t set up in the database yet (Test website SQL).'
        : msg);
    }
    setBusy(false);
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <button type="button" onClick={() => input.current?.click()} disabled={busy}
          className={`absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-1 text-sm text-center p-4 ${dark ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
          <span className="text-2xl" aria-hidden>📷</span>
          <span className="font-medium">{busy ? 'Uploading…' : 'Tap to add a photo'}</span>
          <span className="text-xs opacity-80">{label}</span>
        </button>
      )}
      {url && (
        <button type="button" onClick={() => input.current?.click()} disabled={busy}
          className="absolute bottom-2 right-2 px-2.5 py-1 rounded-full bg-black/60 text-white text-xs font-medium">
          {busy ? 'Uploading…' : 'Change photo'}
        </button>
      )}
      {error && <div className="absolute top-2 left-2 right-2 text-xs bg-red-600 text-white rounded px-2 py-1">{error}</div>}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={pick} />
    </div>
  );
}
