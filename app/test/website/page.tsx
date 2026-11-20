import Link from 'next/link';
import { TRANE } from '@/lib/test-email';

// A mock website for Trane Engineering, P.C., inside the Test tab. The firm's
// details (name, address, phone, fax, services, website, access) are the ones
// the owner gave. Tony's license details, photo and named projects are still
// placeholders in brackets.

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
  return (
    <div className="-mx-4 -my-4 bg-white">
      <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs px-4 py-2">
        Mock website. Firm details are real; bracketed items (license, photo, named projects) still need Tony&apos;s information.
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
        <div className="rounded-2xl bg-slate-100 aspect-square flex items-center justify-center text-slate-400 text-sm text-center p-4">
          [Photo of Tony or the Main Street office]
        </div>
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
          Survey and engineering filings for Lehi City projects are on Engage Lehi. [Replace these cards with featured projects, dates and photos.]
        </p>
        <div className="grid sm:grid-cols-3 gap-4 mt-6">
          {['[Road improvement project]', '[Storm drain / detention project]', '[Subdivision plat & survey]'].map((p) => (
            <div key={p} className="rounded-xl bg-white/5 border border-white/10 p-5">
              <div className="aspect-video rounded-lg bg-white/10 mb-3" />
              <div className="font-medium">{p}</div>
              <div className="text-xs text-slate-400 mt-1">Lehi, Utah · [year]</div>
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
