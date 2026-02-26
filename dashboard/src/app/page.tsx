import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/10 max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-white">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight">Pulse AI</span>
          <span className="text-xs text-slate-500 font-medium border border-slate-700 px-2 py-0.5 rounded-full">by Runstate</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="#use-cases" className="text-sm text-slate-400 hover:text-white transition-colors hidden sm:inline">Use Cases</a>
          <a href="#how-it-works" className="text-sm text-slate-400 hover:text-white transition-colors hidden sm:inline">How It Works</a>
          <Link
            href="/login"
            className="text-sm text-slate-300 hover:text-white font-medium px-4 py-2 border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
          >
            Login
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-8 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-400 bg-indigo-950 border border-indigo-800/60 px-3 py-1.5 rounded-full mb-8">
          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse"></span>
          AI Agents That Actually Work For You
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white leading-[1.1] mb-6">
          Your Business.<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400">Run by AI Agents.</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-400 max-w-3xl mx-auto mb-10 leading-relaxed">
          Pulse AI deploys autonomous agents that work like real employees. They handle your accounting,
          manage your servers, answer your customers, and process your emails — 24/7, without breaks,
          without errors, without excuses.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors shadow-lg shadow-indigo-900/40 text-base"
          >
            Get Started
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          <a
            href="#use-cases"
            className="inline-flex items-center justify-center gap-2 text-slate-300 hover:text-white font-semibold px-8 py-3.5 rounded-xl border border-slate-700 hover:border-slate-500 transition-colors text-base"
          >
            See What They Can Do
          </a>
        </div>

        {/* Social proof line */}
        <p className="mt-12 text-sm text-slate-600">
          Built for businesses that want AI doing real work — not just answering questions.
        </p>
      </section>

      {/* The Problem / Solution */}
      <section className="max-w-5xl mx-auto px-8 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="rounded-2xl border border-red-900/30 bg-red-950/20 p-8">
            <div className="text-red-400 font-semibold text-sm mb-4 uppercase tracking-wider">The Old Way</div>
            <ul className="space-y-3 text-slate-400 text-sm">
              <li className="flex items-start gap-2"><XIcon className="w-4 h-4 text-red-500 mt-0.5 shrink-0" /> Hiring staff for repetitive tasks that drain your budget</li>
              <li className="flex items-start gap-2"><XIcon className="w-4 h-4 text-red-500 mt-0.5 shrink-0" /> Manually chasing invoices, updating spreadsheets, replying to emails</li>
              <li className="flex items-start gap-2"><XIcon className="w-4 h-4 text-red-500 mt-0.5 shrink-0" /> SSH-ing into servers at 2 AM because something broke</li>
              <li className="flex items-start gap-2"><XIcon className="w-4 h-4 text-red-500 mt-0.5 shrink-0" /> Paying for chatbots that can only answer FAQs</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-emerald-900/30 bg-emerald-950/20 p-8">
            <div className="text-emerald-400 font-semibold text-sm mb-4 uppercase tracking-wider">The Pulse Way</div>
            <ul className="space-y-3 text-slate-300 text-sm">
              <li className="flex items-start gap-2"><CheckIcon className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> AI agents that do the actual work — not just talk about it</li>
              <li className="flex items-start gap-2"><CheckIcon className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> Connected to your real systems: ERPNext, servers, APIs, databases</li>
              <li className="flex items-start gap-2"><CheckIcon className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> Always on. Assign tasks via email, Telegram, or WhatsApp</li>
              <li className="flex items-start gap-2"><CheckIcon className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" /> Enterprise-grade security: sandboxed execution, encrypted credentials, audit logs</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section id="use-cases" className="max-w-6xl mx-auto px-8 pb-24">
        <div className="text-center mb-14">
          <div className="text-xs font-semibold text-sky-400 uppercase tracking-wider mb-3">Use Cases</div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">One Platform. Endless Agents.</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">Each agent is purpose-built for a specific role in your business. They have tools, instructions, memory, and they never clock out.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Accounting Agent */}
          <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-6 group hover:border-amber-600/60 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center mb-4">
              <CalculatorIcon className="w-6 h-6 text-amber-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">Accounting Agent</h3>
            <p className="text-sm text-slate-400 mb-4">
              Connects to ERPNext and handles your books like a real accountant. Creates invoices, reconciles payments, generates reports, follows up on overdue accounts.
            </p>
            <div className="text-xs text-amber-500/80 font-mono">
              &quot;Create a sales invoice for Client X, 50 hours at $120/hr&quot;
            </div>
          </div>

          {/* IT / DevOps Agent */}
          <div className="rounded-xl border border-sky-800/40 bg-sky-950/20 p-6 group hover:border-sky-600/60 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center mb-4">
              <ServerIcon className="w-6 h-6 text-sky-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">IT / DevOps Agent</h3>
            <p className="text-sm text-slate-400 mb-4">
              SSH into your VPS, install packages, restart services, check logs, deploy code. Like having a sysadmin on call 24/7 who never sleeps and never complains.
            </p>
            <div className="text-xs text-sky-500/80 font-mono">
              &quot;Check disk usage on prod-server-2 and clean up old Docker images&quot;
            </div>
          </div>

          {/* Customer Support Agent */}
          <div className="rounded-xl border border-violet-800/40 bg-violet-950/20 p-6 group hover:border-violet-600/60 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center mb-4">
              <ChatIcon className="w-6 h-6 text-violet-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">Customer Support Agent</h3>
            <p className="text-sm text-slate-400 mb-4">
              Answers customer questions on Telegram, WhatsApp, or web chat. Not a dumb FAQ bot — it checks order status, processes returns, escalates when needed.
            </p>
            <div className="text-xs text-violet-500/80 font-mono">
              &quot;Where is my order SO-2024-0891?&quot; &rarr; checks ERPNext &rarr; real answer
            </div>
          </div>

          {/* Email / Inbox Agent */}
          <div className="rounded-xl border border-rose-800/40 bg-rose-950/20 p-6 group hover:border-rose-600/60 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center mb-4">
              <EnvelopeIcon className="w-6 h-6 text-rose-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">Email Inbox Agent</h3>
            <p className="text-sm text-slate-400 mb-4">
              Assign jobs by sending an email. &quot;Pull last month&apos;s revenue numbers&quot; — the agent reads it, runs the report, and replies with the answer. That simple.
            </p>
            <div className="text-xs text-rose-500/80 font-mono">
              Forward an email &rarr; agent processes it &rarr; reply lands in your inbox
            </div>
          </div>

          {/* Scheduling Agent */}
          <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-6 group hover:border-emerald-600/60 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4">
              <ClockIcon className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">Scheduled Ops Agent</h3>
            <p className="text-sm text-slate-400 mb-4">
              Runs tasks on a schedule — daily backup checks, weekly financial summaries, monthly invoice generation. Set it once, it runs forever.
            </p>
            <div className="text-xs text-emerald-500/80 font-mono">
              Every Monday 9 AM &rarr; &quot;Generate outstanding receivables report&quot;
            </div>
          </div>

          {/* Multi-Agent */}
          <div className="rounded-xl border border-indigo-800/40 bg-indigo-950/20 p-6 group hover:border-indigo-600/60 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center mb-4">
              <UsersIcon className="w-6 h-6 text-indigo-400" />
            </div>
            <h3 className="font-semibold text-white mb-2">Multi-Agent Teams</h3>
            <p className="text-sm text-slate-400 mb-4">
              Agents can delegate to each other. Your support agent can ask the accounting agent to check a balance, or the DevOps agent to restart a service. They collaborate.
            </p>
            <div className="text-xs text-indigo-500/80 font-mono">
              Support &rarr; delegates to Accounting &rarr; gets answer &rarr; replies to customer
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-8 pb-24">
        <div className="text-center mb-14">
          <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3">How It Works</div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Up and Running in Minutes</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { step: "01", title: "Create an Agent", desc: "Give it a name, role, and instructions. Tell it what it's responsible for." },
            { step: "02", title: "Connect Your Tools", desc: "Add credentials for ERPNext, email, SSH servers, APIs — whatever it needs." },
            { step: "03", title: "Plug In a Channel", desc: "Wire up Telegram, WhatsApp, email, or the API. That's where tasks come in." },
            { step: "04", title: "Let It Work", desc: "The agent handles incoming tasks autonomously. You review results, not processes." },
          ].map((s) => (
            <div key={s.step} className="text-center">
              <div className="text-4xl font-black text-slate-800 mb-3">{s.step}</div>
              <h3 className="text-sm font-semibold text-white mb-2">{s.title}</h3>
              <p className="text-xs text-slate-500">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Platform Capabilities */}
      <section className="max-w-5xl mx-auto px-8 pb-24">
        <div className="text-center mb-14">
          <div className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3">Under the Hood</div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Built for Real Work, Not Demos</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Sandboxed Execution", desc: "Python code runs in isolated containers. No risk to your systems.", color: "text-sky-400" },
            { label: "Encrypted Vault", desc: "API keys stored with AES-256-GCM encryption. Zero plaintext, ever.", color: "text-emerald-400" },
            { label: "Audit Logging", desc: "Every action logged. Full visibility into what agents do and when.", color: "text-amber-400" },
            { label: "Plugin System", desc: "Drop a plugin folder, restart, it's live. ERPNext, Stripe, anything.", color: "text-rose-400" },
            { label: "Multi-Tenant", desc: "One platform, many businesses. Complete data isolation between tenants.", color: "text-indigo-400" },
            { label: "Credit Billing", desc: "Pre-paid tokens with real-time tracking. No surprise invoices.", color: "text-violet-400" },
            { label: "Agent Memory", desc: "Agents remember past conversations and learn from interactions.", color: "text-sky-400" },
            { label: "OpenAI Fallback", desc: "Anthropic primary, OpenAI fallback. Your agents never go offline.", color: "text-emerald-400" },
          ].map((f) => (
            <div key={f.label} className="rounded-lg border border-white/5 bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors">
              <h4 className={`text-sm font-semibold mb-1 ${f.color}`}>{f.label}</h4>
              <p className="text-xs text-slate-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-8 pb-24 text-center">
        <div className="rounded-2xl border border-indigo-800/40 bg-gradient-to-b from-indigo-950/60 to-slate-950 p-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Stop Hiring for Tasks.<br />Deploy Agents Instead.
          </h2>
          <p className="text-slate-400 mb-8 max-w-xl mx-auto">
            Every hour your team spends on repetitive work is an hour an AI agent could handle — faster, cheaper, and without taking a day off.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors shadow-lg shadow-indigo-900/40 text-base"
          >
            Start Now
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-8 text-center text-xs text-slate-600">
        &copy; {new Date().getFullYear()} Runstate Ltd &middot; Pulse AI &middot; <a href="https://runstate.mu" className="hover:text-slate-400 transition-colors">runstate.mu</a>
      </footer>
    </div>
  );
}

/* --- Inline SVG Icons --- */

function XIcon(props: any) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CheckIcon(props: any) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function CalculatorIcon(props: any) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008H15.75v-.008zm0 2.25h.008v.008H15.75V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z" />
    </svg>
  );
}

function ServerIcon(props: any) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z" />
    </svg>
  );
}

function ChatIcon(props: any) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
    </svg>
  );
}

function EnvelopeIcon(props: any) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function ClockIcon(props: any) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function UsersIcon(props: any) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  );
}
