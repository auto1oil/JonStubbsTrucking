'use client';
import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { maybeCompressImage } from '@/lib/image-compress';
import type { ScanKind } from '@/lib/scan-schemas';

// "Scan it": take a photo (or pick a PDF), keep the file as the record's
// attachment, and have the server read it into the form. The caller gets
// the fields and the stored file path together and decides what to fill.
//
// Nothing is overwritten by surprise: callers fill only blank boxes unless
// they choose otherwise, and the user sees what was read before saving.

export default function ScanButton({ kind, bucket, folder, label = 'Scan it', onScanned }: {
  kind: ScanKind;
  bucket: string;
  folder: string | undefined;
  label?: string;
  onScanned: (fields: Record<string, unknown>, filePath: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'' | 'uploading' | 'reading'>('');
  const [note, setNote] = useState<{ tone: 'ok' | 'warn' | 'bad'; text: string } | null>(null);

  async function handle(file: File) {
    setBusy('uploading'); setNote(null);
    const supabase = createClient();
    let filePath: string | null = null;
    try {
      const small = file.type === 'application/pdf' ? file : await maybeCompressImage(file);
      // Keep the paper: it's the receipt/registration on file either way.
      const { data: { user } } = await supabase.auth.getUser();
      const ext = (small.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const key = `${folder || user?.id || 'company'}/${Date.now()}-${kind}.${ext}`;
      const { error: upErr } = await supabase.storage.from(bucket).upload(key, small, { upsert: false });
      if (!upErr) filePath = key;

      setBusy('reading');
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = () => reject(new Error('could not read the file'));
        r.readAsDataURL(small);
      });
      const res = await fetch('/api/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, media_type: small.type || 'image/jpeg', data }),
      });
      const json = await res.json();
      if (!json.ok) {
        setNote({ tone: 'bad', text: json.error || 'Could not read it.' });
        onScanned({}, filePath);
        return;
      }
      const f = json.fields as Record<string, unknown> & { confidence?: string; notes?: string | null };
      const filled = Object.entries(f).filter(([k, v]) => v !== null && v !== undefined && v !== '' && k !== 'confidence' && k !== 'notes').length;
      setNote({
        tone: f.confidence === 'low' ? 'warn' : 'ok',
        text: `${filled ? `Read ${filled} field${filled === 1 ? '' : 's'}` : 'Nothing readable'}${f.confidence === 'low' ? ' — low confidence, check every box' : ''}${f.notes ? ` · ${f.notes}` : ''}. Check it and save.`,
      });
      onScanned(f, filePath);
    } catch (err) {
      setNote({ tone: 'bad', text: err instanceof Error ? err.message : 'Scan failed.' });
      onScanned({}, filePath);
    } finally {
      setBusy('');
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={!!busy}
        className="px-4 py-2.5 text-sm rounded-md border-2 border-brand-700 text-brand-700 font-medium hover:bg-brand-50 disabled:opacity-50 min-h-[44px] inline-flex items-center gap-2"
      >
        <span aria-hidden>📷</span>
        {busy === 'uploading' ? 'Saving the photo…' : busy === 'reading' ? 'Reading it…' : label}
      </button>
      {note && (
        <p className={`text-xs mt-1.5 ${note.tone === 'ok' ? 'text-emerald-700' : note.tone === 'warn' ? 'text-amber-700' : 'text-red-600'}`}>{note.text}</p>
      )}
    </div>
  );
}
