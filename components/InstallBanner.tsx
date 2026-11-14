'use client';
import { useEffect, useState } from 'react';

// A one-time nudge on phones to put the app on the home screen, so it opens
// full-screen like an app and the push badge works. Android gets the real
// install prompt; iPhone gets the two taps Safari needs. Dismissed once, it
// stays gone on that device; it never shows inside the installed app.

const KEY = 'jst-install-banner-dismissed';

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function InstallBanner() {
  const [show, setShow] = useState<'ios' | 'android' | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY)) return;
    } catch { return; }
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isAndroid = /Android/i.test(ua);
    if (isIOS) { setShow('ios'); return; }
    if (isAndroid) {
      const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); setShow('android'); };
      window.addEventListener('beforeinstallprompt', onPrompt);
      return () => window.removeEventListener('beforeinstallprompt', onPrompt);
    }
  }, []);

  function dismiss() {
    try { localStorage.setItem(KEY, '1'); } catch { /* fine */ }
    setShow(null);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
    if (choice.outcome === 'accepted') dismiss();
  }

  if (!show) return null;
  return (
    <div className="bg-brand-900 text-white text-sm px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
      <span>
        <strong>Put Jon Stubbs Trucking on your home screen</strong> so it opens like an app.{' '}
        {show === 'ios'
          ? <>Tap <span aria-hidden>⎙</span> Share, then <strong>Add to Home Screen</strong>.</>
          : 'One tap and it installs.'}
      </span>
      <span className="flex gap-2 shrink-0">
        {show === 'android' && (
          <button onClick={install} className="px-3 py-1.5 rounded-md bg-white text-brand-900 font-medium text-sm">Install</button>
        )}
        <button onClick={dismiss} className="px-3 py-1.5 rounded-md border border-white/40 text-sm">Not now</button>
      </span>
    </div>
  );
}
