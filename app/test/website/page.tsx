import Link from 'next/link';

// A mock website for Trane Engineering, inside the Test tab. Nothing about
// the firm or Tony could be found publicly, so the specifics (license
// number, address, phone, email, named projects) are placeholders marked in
// brackets; the copy describes the kind of practice the owner described —
// civil engineering in Lehi with a lot of work for Lehi City — without
// inventing facts about a real person.

const SERVICES = [
  { t: 'Site & subdivision design', d: 'Site plans, subdivision layouts and plats, grading, and the drawings a planning commission needs to say yes.' },
  { t: 'Grading & drainage', d: 'Grading plans, storm drain design, detention and retention sizing, and SWPPP plans that hold up in a Utah spring.' },
  { t: 'Utilities', d: 'Culinary water, pressurized irrigation, and sanitary sewer design and extensions, coordinated with city standards.' },
  { t: 'Roads & transportation', d: 'Street and intersection design, curb, gutter and sidewalk, ADA ramps, and traffic control plans.' },
  { t: 'Municipal engineering', d: 'Plan review, capital project design, and construction observation for cities that need an engineer who knows their standards.' },
  { t: 'Construction services', d: 'Site visits, inspections, as-builts and close-out, so what got built matches what got approved.' },
];

const FIELD = [
  ['Site visits', 'On site when the work is: pre-construction meetings, inspections, and problem-solving in the field.'],
  ['Knows Lehi', 'Years of work with Lehi City: its standards, its reviewers, and its growth.'],
  ['Straight answers', 'Clear scopes, honest schedules, and drawings that get approved the first time more often than not.'],
];

export default function TraneWebsite() {
  return (
    <div className="-mx-4 -my-4 bg-white">
      <div className="bg-amber-50 border-b border-amber-200 text-amber-900 text-xs px-4 py-2">
        Mock website for the test. Bracketed details are placeholders — nothing public was found to confirm them. Replace with Tony&apos;s real information before this goes live.
      </div>

      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 text-white px-6 py-14">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Civil engineering · Lehi, Utah</p>
        <h1 className="text-4xl sm:text-5xl font-bold mt-3 leading-tight">Trane Engineering</h1>
        <p className="text-lg text-slate-200 mt-3 max-w-xl">
          Practical civil engineering for Utah County&apos;s growing communities — from the first site plan to the last inspection.
        </p>
        <div className="flex gap-3 mt-6 flex-wrap">
          <a href="#contact" className="px-5 py-3 rounded-lg bg-emerald-500 text-slate-900 font-semibold">Request a proposal</a>
          <a href="#services" className="px-5 py-3 rounded-lg border border-white/40 font-medium">Our services</a>
        </div>
      </section>

      {/* About */}
      <section className="px-6 py-12 grid sm:grid-cols-3 gap-8 items-start">
        <div className="sm:col-span-2">
          <h2 className="text-2xl font-bold text-slate-900">Meet Tony Trane, P.E.</h2>
          <p className="text-gray-700 mt-3 leading-relaxed">
            Tony Trane is a civil engineer based in Lehi, Utah, and the founder of Trane Engineering. Much of his work is for
            Lehi City — the kind of municipal engineering that keeps a fast-growing city&apos;s roads, water, and drainage ahead
            of the homes and businesses that depend on them.
          </p>
          <p className="text-gray-700 mt-3 leading-relaxed">
            Developers, contractors and cities call Trane Engineering when they want an engineer who answers the phone, shows up on
            site, and knows how local review works.
          </p>
          <p className="text-sm text-gray-500 mt-3">[Licensed Professional Engineer, State of Utah — license no. placeholder] · [Education and years in practice — to be added]</p>
        </div>
        <div className="rounded-2xl bg-slate-100 aspect-square flex items-center justify-center text-slate-400 text-sm text-center p-4">
          [Photo of Tony]
        </div>
      </section>

      {/* Services */}
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

      {/* Why */}
      <section className="px-6 py-12">
        <h2 className="text-2xl font-bold text-slate-900">Why Trane Engineering</h2>
        <div className="grid sm:grid-cols-3 gap-6 mt-6">
          {FIELD.map(([t, d]) => (
            <div key={t}>
              <div className="w-10 h-1 bg-emerald-500 rounded mb-3" />
              <h3 className="font-semibold">{t}</h3>
              <p className="text-sm text-gray-600 mt-1">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Projects */}
      <section className="bg-slate-900 text-white px-6 py-12">
        <h2 className="text-2xl font-bold">Lehi City work</h2>
        <p className="text-slate-300 mt-2 max-w-xl text-sm">A sample of municipal projects. [Replace with real project names, dates and photos.]</p>
        <div className="grid sm:grid-cols-3 gap-4 mt-6">
          {['[Road improvement project]', '[Storm drain / detention project]', '[Water line or PI extension]'].map((p) => (
            <div key={p} className="rounded-xl bg-white/5 border border-white/10 p-5">
              <div className="aspect-video rounded-lg bg-white/10 mb-3" />
              <div className="font-medium">{p}</div>
              <div className="text-xs text-slate-400 mt-1">Lehi, Utah · [year]</div>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="px-6 py-12 grid sm:grid-cols-2 gap-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Start a project</h2>
          <p className="text-gray-700 mt-2">Tell us about the site and the schedule, and we&apos;ll come back with a scope and a fee.</p>
          <div className="mt-4 text-sm text-gray-700 space-y-1">
            <p>Trane Engineering</p>
            <p>[Street address], Lehi, UT 84043</p>
            <p>[Phone]</p>
            <p>[Email]</p>
          </div>
        </div>
        <form className="space-y-2" action="#">
          <input disabled placeholder="Your name" className="w-full px-3 py-2.5 border rounded-lg bg-gray-50" />
          <input disabled placeholder="Email" className="w-full px-3 py-2.5 border rounded-lg bg-gray-50" />
          <textarea disabled placeholder="About the project" rows={3} className="w-full px-3 py-2.5 border rounded-lg bg-gray-50" />
          <button type="button" disabled className="w-full py-3 rounded-lg bg-slate-900 text-white font-medium opacity-60">Send (mock — not wired up)</button>
        </form>
      </section>

      <footer className="border-t border-gray-200 px-6 py-6 text-xs text-gray-500 flex justify-between flex-wrap gap-2">
        <span>© {new Date().getFullYear()} Trane Engineering · Lehi, Utah</span>
        <Link href="/test/log" className="underline">Back to Log time</Link>
      </footer>
    </div>
  );
}
