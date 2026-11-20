'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { TRANE } from '@/lib/test-email';
import SitePhoto from '@/components/SitePhoto';

// A mock website for Trane Engineering, P.C., inside the Test tab. The firm's
// details (name, address, phone, fax, services, website, access) are the ones
// the owner gave. The photo spots and project cards are filled in from the
// phone: tap a spot to add a picture, tap Edit on a card to name the project.

type Content = { slot: string; photo_path: string | null; title: string | null; subtitle: string | null };

const PROJECTS = [
  { slot: 'project1', title: 'Road improvement project' },
  { slot: 'project2', title: 'Storm drain / detention project' },
  { slot: 'project3', title: 'Subdivision plat & survey' },
];

const SERVICES = [
  { t: 'Land surveying', d: 'Boundary and topographic surveys, ALTA/NSPS surveys, subdivision and condominium plats, and construction staking.' },
  { t: 'Site & subdivision design', d: 'Site plans, subdivision layouts, grading, and the drawings a planning commission needs to say yes.' },
  { t: 'Grading & drainage', d: 'Grading plans, storm drain design, detention and retention sizing, and stormwater plans built for Utah weather.' },
  { t: 'Utilities', d: 'Culinary water, pressurized irrigation, and sanitary sewer design and extensions to city standards.' },
  { t: 'Roads & transportation', d: 'Street and intersection design, curb, gutter and sidewalk, ADA ramps, and traffic control plans.' },
  { t: 'Municipal engineering', d: 'Plan review, capital project design, and construction observation for Lehi City and neighboring communities.' },
];

const WHY = [
  ['Surveyors and engineers under one roof', 'The survey and the design come from the same office, so nothing gets lost between them.'],
  ['Rooted in Lehi', 'On Main Street in Lehi’s historic district, with years of work for Lehi City.'],
  ['On site when it matters', 'Pre-construction meetings, staking, inspections, and problem-solving in the field.'],
];

export default function TraneWebsite() {
  const [content, setContent] = useState<Record<string, Content>>({});

  useEffect(() => {
    createClient().from('test_site_content').select('slot, photo_path, title, subtitle').then(({ data }) => {
      const map: Record<string, Content> = {};
      for (const r of (data as Content[]) || []) map[r.slot] = r;
      setContent(map);
    });
  }, []);

  const photo = (slot: string) => content[slot]?.photo_path ?? null;
  const saved = (slot: string, path: string) =>
    setContent((c) => ({ ...c, [slot]: { slot, title: c[slot]?.title ?? null, subtitle: c[slot]?.subtitle ?? null, photo_path: path } }));

  async function editProject(slot: string, fallback: string) {
    const cur = content[slot];
    const title = window.prompt('Project name', cur?.title || fallback);
    if (title === null) return;
    const subtitle = window.prompt('Place and year (e.g. Lehi, Utah · 2024)', cur?.subtitle || 'Lehi, Utah');
    if (subtitle === null) return;
    const row = { slot, title: title.trim() || null, subtitle: subtitle.trim() || null, updated_at: new Date().toISOString() };
    const { error } = await createClient().from('test_site_content').upsert(row, { onConflict: 'slot' });
    if (error) { alert(error.message); return; }
    setContent((c) => ({ ...c, [slot]: { slot, photo_path: c[slot]?.photo_path ?? null, title: row.title, subtitle: row.subtitle } }));
  }

  return (
    <div className="-mx-4 -my-4 bg-white">
      <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs px-4 py-2">
        Mock website. Firm details are real. Tap any photo spot to add a picture from your phone, and tap Edit on a project card to name it.
      </div>

      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 text-white px-6 py-14">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Consulting civil engineers & land surveyors · Lehi, Utah</p>
        <h1 className="text-4xl sm:text-5xl font-bold mt-3 leading-tight">Trane Engineering</h1>
        <p className="text-lg text-slate-200 mt-3 max-w-xl">
          Civil engineering and land surveying from Lehi&apos;s historic Main Street — from the first survey to the last inspection.
        </p>
        <div className="flex gap-3 mt-6 flex-wrap">
          <a href={`tel:${TRANE.phone.replace(/[^0-9]/g, '')}`} className="px-5 py-3 rounded-lg bg-emerald-500 text-slate-900 font-semibold">Call {TRANE.phone}</a>
          <a href="#services" className="px-5 py-3 rounded-lg border border-white/40 font-medium">Our services</a>
        </div>
      </section>

      <section className="px-6 py-12 grid sm:grid-cols-3 gap-8 items-start">
        <div className="sm:col-span-2">
          <h2 className="text-2xl font-bold text-slate-900">About the firm</h2>
          <p className="text-gray-700 mt-3 leading-relaxed">
            {TRANE.legalName} is a civil engineering and land surveying firm at 27 East Main Street in Lehi, in the Lehi Main
            Street Historic District. Led by civil engineer Tony Trane, the firm does a large share of its work for Lehi City,
            along with developers, contractors and property owners across Utah County.
          </p>
          <p className="text-gray-700 mt-3 leading-relaxed">
            Survey and design under one roof means a project starts on solid ground and moves through review without surprises.
          </p>
          <p className="text-sm text-gray-500 mt-3">[Tony Trane, P.E. — Utah license no. and education to be added]</p>
        </div>
        <SitePhoto slot="about" path={photo('about')} label="Tony or the Main Street office" onSaved={saved}
          className="rounded-2xl aspect-square" />
      </section>

      <section id="services" className="bg-slate-50 px-6 py-12">
        <h2 className="text-2xl font-bold text-slate-900">Services</h2>
        <div className="grid sm:grid-cols-2 gap-4 mt-6">
          {SERVICES.map((s) => (
            <div key={s.t} className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-slate-900">{s.t}</h3>
              <p className="text-sm text-gray-600 mt-1.5">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-12">
        <h2 className="text-2xl font-bold text-slate-900">Why Trane Engineering</h2>
        <div className="grid sm:grid-cols-3 gap-6 mt-6">
          {WHY.map(([t, d]) => (
            <div key={t}>
              <div className="w-10 h-1 bg-emerald-500 rounded mb-3" />
              <h3 className="font-semibold">{t}</h3>
              <p className="text-sm text-gray-600 mt-1">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-900 text-white px-6 py-12">
        <h2 className="text-2xl font-bold">Lehi City work</h2>
        <p className="text-slate-300 mt-2 max-w-xl text-sm">
          Survey and engineering filings for Lehi City projects are on Engage Lehi.
        </p>
        <div className="grid sm:grid-cols-3 gap-4 mt-6">
          {PROJECTS.map((p) => (
            <div key={p.slot} className="rounded-xl bg-white/5 border border-white/10 p-5">
              <SitePhoto slot={p.slot} path={photo(p.slot)} label="A photo of this project" onSaved={saved} dark
                className="aspect-video rounded-lg mb-3" />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{content[p.slot]?.title || p.title}</div>
                  <div className="text-xs text-slate-400 mt-1">{content[p.slot]?.subtitle || 'Lehi, Utah'}</div>
                </div>
                <button type="button" onClick={() => editProject(p.slot, p.title)} className="text-xs underline text-slate-400 shrink-0">Edit</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="contact" className="px-6 py-12 grid sm:grid-cols-2 gap-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Visit or call</h2>
          <div className="mt-4 text-gray-700 space-y-1.5">
            <p className="font-medium">{TRANE.legalName}</p>
            <p>
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(TRANE.address)}`} target="_blank" rel="noopener noreferrer" className="underline">
                {TRANE.address}
              </a>
            </p>
            <p>Phone <a href={`tel:${TRANE.phone.replace(/[^0-9]/g, '')}`} className="underline">{TRANE.phone}</a></p>
            <p>Fax {TRANE.fax}</p>
            <p>{TRANE.website}</p>
          </div>
          <p className="text-sm text-gray-500 mt-4">Wheelchair-accessible entrance and parking lot, with on-site parking.</p>
        </div>
        <form className="space-y-2" action="#">
          <input disabled placeholder="Your name" className="w-full px-3 py-2.5 border rounded-lg bg-gray-50" />
          <input disabled placeholder="Email or phone" className="w-full px-3 py-2.5 border rounded-lg bg-gray-50" />
          <textarea disabled placeholder="About the project" rows={3} className="w-full px-3 py-2.5 border rounded-lg bg-gray-50" />
          <button type="button" disabled className="w-full py-3 rounded-lg bg-slate-900 text-white font-medium opacity-60">Send (mock — not wired up)</button>
        </form>
      </section>

      <footer className="border-t border-gray-200 px-6 py-6 text-xs text-gray-500 flex justify-between flex-wrap gap-2">
        <span>© {new Date().getFullYear()} {TRANE.legalName} · Lehi, Utah</span>
        <Link href="/test/log" className="underline">Back to Log time</Link>
      </footer>
    </div>
  );
}
