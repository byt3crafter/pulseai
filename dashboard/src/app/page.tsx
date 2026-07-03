import Link from "next/link";

const CONTACT = "mailto:hello@runstate.mu?subject=Pulse%20Agentic%20—%20Enterprise%20enquiry";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white antialiased selection:bg-violet-500/30">
      {/* Nav */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#09090b]/70 border-b border-white/[0.06]">
        <nav className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center">
              <BoltIcon className="w-4 h-4 text-white" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight">Pulse</span>
            <span className="text-[11px] text-white/40 border border-white/10 px-2 py-0.5 rounded-full">by Runstate</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#story" className="text-[13px] text-white/60 hover:text-white transition-colors hidden sm:inline">How it works</a>
            <Link href="/login" className="text-[13px] text-white/70 hover:text-white transition-colors">Sign in</Link>
            <a href={CONTACT} className="text-[13px] font-medium bg-white text-black hover:bg-white/90 px-4 py-1.5 rounded-lg transition-colors">Contact us</a>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-violet-600/20 blur-[140px]" />
        <div className="relative max-w-4xl mx-auto px-6 pt-28 pb-24 text-center">
          <div className="inline-flex items-center gap-2 text-[12px] font-medium text-violet-300 bg-violet-500/10 border border-violet-500/20 px-3 py-1 rounded-full mb-8">
            <span className="w-1.5 h-1.5 bg-violet-400 rounded-full" /> Agentic AI for the enterprise
          </div>
          <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
            Give your company
            <br />
            an <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-300 to-violet-500">AI workforce</span>.
          </h1>
          <p className="mt-7 text-lg text-white/55 max-w-2xl mx-auto leading-relaxed">
            Pulse Agentic turns AI into an organized team — departments led by a manager, specialists
            that do the work, all talking to each other, using your own systems, and acting on your behalf.
            In your own private app. On your own infrastructure.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <a href={CONTACT} className="inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-medium px-6 py-3 rounded-xl transition-colors">
              Contact us <ArrowIcon className="w-4 h-4" />
            </a>
            <Link href="/login" className="inline-flex items-center justify-center gap-2 text-white/80 hover:text-white font-medium px-6 py-3 rounded-xl border border-white/10 hover:border-white/25 transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Story */}
      <section id="story" className="max-w-5xl mx-auto px-6 py-20 border-t border-white/[0.06]">
        <div className="max-w-2xl">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Not a chatbot. A company of agents.</h2>
          <p className="mt-5 text-white/55 leading-relaxed">
            Most AI stops at answering questions. Pulse goes further. You design an org chart of agents —
            Sales, Support, Operations — each with its own role. Your people talk to a department; its lead
            agent answers, or routes the work to the right specialist, who gets it done using the tools you
            connect. It is the difference between an assistant and a team.
          </p>
        </div>

        {/* Minimal org visual */}
        <div className="mt-12 grid gap-4">
          <OrgNode label="Your Company" tone="lead" className="mx-auto" />
          <div className="flex justify-center"><span className="w-px h-6 bg-white/10" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { dept: "Sales", lead: "Lead agent", roles: ["Quotes", "Pipeline", "EU team"] },
              { dept: "Support", lead: "Lead agent", roles: ["Tickets", "Troubleshooting"] },
              { dept: "Operations", lead: "Lead agent", roles: ["Reports", "Deployments"] },
            ].map((d) => (
              <div key={d.dept} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
                <div className="text-[13px] font-semibold">{d.dept}</div>
                <div className="text-[11px] text-violet-300/80 mt-0.5">{d.lead} · answers & routes</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {d.roles.map((r) => (
                    <span key={r} className="text-[11px] text-white/60 border border-white/10 rounded-md px-2 py-0.5">{r}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="max-w-5xl mx-auto px-6 py-20 border-t border-white/[0.06]">
        <div className="grid md:grid-cols-3 gap-6">
          <Capability
            icon={<UsersIcon className="w-5 h-5" />}
            title="An org, not an assistant"
            body="Departments, ranks, and a manager that routes work to the right specialist. Agents delegate to each other and hand off across teams — like a real workforce."
          />
          <Capability
            icon={<PlugIcon className="w-5 h-5" />}
            title="Connected to your world"
            body="Plug in your APIs, software, and data. Your own systems become actions your agents can take — pull analytics, process orders, resolve tickets, run operations."
          />
          <Capability
            icon={<ShieldIcon className="w-5 h-5" />}
            title="Private by design"
            body="Your own branded desktop and mobile app instead of public chat tools. Your data on your own infrastructure, with SSO, two-factor, role-based access, and full audit logs."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-6 py-20 border-t border-white/[0.06]">
        <h2 className="text-2xl font-semibold tracking-tight mb-10">Three steps to a working team</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { n: "01", t: "Design your org", d: "Create departments and agents. Give each a role, a persona, and a lead that fields requests." },
            { n: "02", t: "Connect your tools", d: "Add your APIs and systems as actions. Your agents work inside your real software, not a sandbox." },
            { n: "03", t: "Hand it to your team", d: "Your people work with the agents from your own private app — desktop and mobile." },
          ].map((s) => (
            <div key={s.n}>
              <div className="text-[13px] font-mono text-violet-400/70">{s.n}</div>
              <h3 className="mt-2 text-[15px] font-semibold">{s.t}</h3>
              <p className="mt-1.5 text-[13px] text-white/50 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-12 text-center">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-32 h-64 bg-violet-600/15 blur-[100px]" />
          <h2 className="relative text-3xl md:text-4xl font-semibold tracking-tight">Put an agentic workforce to work.</h2>
          <p className="relative mt-4 text-white/55 max-w-xl mx-auto">
            Tell us about your business and we will design the right team of agents for it.
          </p>
          <a href={CONTACT} className="relative mt-8 inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-medium px-7 py-3 rounded-xl transition-colors">
            Contact us <ArrowIcon className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-white/40">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center"><BoltIcon className="w-3 h-3 text-white" /></div>
            Pulse · by Runstate
          </div>
          <div className="flex items-center gap-5">
            <a href={CONTACT} className="hover:text-white/70 transition-colors">Contact</a>
            <Link href="/login" className="hover:text-white/70 transition-colors">Sign in</Link>
            <span>© {new Date().getFullYear()} Runstate Ltd</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Capability({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 hover:border-white/15 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-violet-500/10 text-violet-300 flex items-center justify-center">{icon}</div>
      <h3 className="mt-4 text-[15px] font-semibold">{title}</h3>
      <p className="mt-2 text-[13px] text-white/50 leading-relaxed">{body}</p>
    </div>
  );
}

function OrgNode({ label, tone, className = "" }: { label: string; tone?: "lead"; className?: string }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-[13px] font-semibold ${tone === "lead" ? "border-violet-500/30 bg-violet-500/10 text-violet-100" : "border-white/10 bg-white/[0.02]"} ${className}`}>
      {label}
    </div>
  );
}

/* --- icons --- */
function BoltIcon(p: any) { return (<svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" {...p}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>); }
function ArrowIcon(p: any) { return (<svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" {...p}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>); }
function UsersIcon(p: any) { return (<svg fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" {...p}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>); }
function PlugIcon(p: any) { return (<svg fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" {...p}><path strokeLinecap="round" strokeLinejoin="round" d="M15 6.75V3.75m-6 3V3.75M8.25 6.75h7.5a1.5 1.5 0 011.5 1.5v2.25a5.25 5.25 0 01-5.25 5.25A5.25 5.25 0 016.75 10.5V8.25a1.5 1.5 0 011.5-1.5zM12 15.75V21" /></svg>); }
function ShieldIcon(p: any) { return (<svg fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" {...p}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>); }
