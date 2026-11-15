// POST /api/scan — read a photo of paperwork and hand back the form fields.
// Body: { kind, media_type, data } where data is base64 of a JPEG/PNG/WebP
// photo or a PDF. kind picks the document type (lib/scan-schemas.ts).
//
// The photo goes to Claude with a structured-output schema, so what comes
// back is exactly the shape the form wants, every field nullable. The key
// lives in ANTHROPIC_API_KEY on the server and never reaches a browser.

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { createClient } from '@/lib/supabase-server';
import { SCAN_KINDS, SCAN_SCHEMAS, SCAN_PROMPTS, SCAN_SYSTEM, type ScanKind } from '@/lib/scan-schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'not signed in' }, { status: 401 });
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!me || ['customer', 'funder', 'contractor'].includes(me.role)) {
    return NextResponse.json({ ok: false, error: 'not allowed' }, { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: 'Scanning isn\'t set up yet — an admin adds ANTHROPIC_API_KEY in Vercel.' }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { kind?: string; media_type?: string; data?: string };
  const kind = body.kind as ScanKind;
  if (!SCAN_KINDS.includes(kind)) return NextResponse.json({ ok: false, error: 'unknown document kind' }, { status: 400 });
  const mediaType = body.media_type || '';
  const data = body.data || '';
  if (!data || data.length * 0.75 > MAX_BYTES) return NextResponse.json({ ok: false, error: 'no photo, or too large' }, { status: 400 });
  const isPdf = mediaType === 'application/pdf';
  if (!isPdf && !IMAGE_TYPES.includes(mediaType as ImageType)) {
    return NextResponse.json({ ok: false, error: 'send a JPEG, PNG, WebP or PDF' }, { status: 400 });
  }

  const client = new Anthropic();
  const schema = SCAN_SCHEMAS[kind];
  const file: Anthropic.Beta.BetaContentBlockParam = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType as ImageType, data } };

  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4096,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: zodOutputFormat(schema) },
      system: SCAN_SYSTEM,
      messages: [{ role: 'user', content: [file, { type: 'text', text: SCAN_PROMPTS[kind] }] }],
    });
    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ ok: false, error: 'The scanner declined to read that image. Fill the form in by hand.' });
    }
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success) return NextResponse.json({ ok: false, error: 'Could not make sense of the scan — fill it in by hand.' });
    return NextResponse.json({ ok: true, fields: parsed.data });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ ok: false, error: 'The scanning key was refused — check ANTHROPIC_API_KEY in Vercel.' }, { status: 503 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ ok: false, error: 'The scanner is busy — try again in a moment.' }, { status: 503 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ ok: false, error: `The scanner answered ${err.status}: ${err.message}` }, { status: 502 });
    }
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'scan failed' }, { status: 502 });
  }
}
