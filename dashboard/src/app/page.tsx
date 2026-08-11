import { Sora, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { redirect } from "next/navigation";
import { auth } from "../auth";
import { getDeploymentFlags } from "../utils/branding";
import styles from "./landing.module.css";
import LandingNav from "./LandingNav";
import LandingFaq from "./LandingFaq";
import PulseLogo from "./PulseLogo";

export const dynamic = "force-dynamic";

const sora = Sora({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-sora" });
const instrumentSans = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-instrument" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

const CONTACT = "mailto:hello@runstate.mu?subject=Pulse%20AI%20%E2%80%94%20Book%20a%20Demo";

type SystemTile = { key: string; name: string; kind: string; bg: string; radius: string; label: string; font: number; mono?: boolean; status?: "live" | "request" };

// Hero visual — a representative mix (decorative "connect your systems").
const SYSTEMS: SystemTile[] = [
    { key: "erpnext", name: "ERPNext", kind: "ERP", bg: "#1667D9", radius: "8px", label: "E", font: 14, status: "live" },
    { key: "email", name: "Email", kind: "SMTP / IMAP", bg: "#F59E0B", radius: "8px", label: "@", font: 15, status: "live" },
    { key: "quickbooks", name: "QuickBooks", kind: "Accounting", bg: "#2CA01C", radius: "50%", label: "qb", font: 11, status: "request" },
    { key: "api", name: "REST APIs", kind: "Custom tools", bg: "#334155", radius: "8px", label: "api", font: 12, mono: true, status: "live" },
];

// Full integrations grid — "Live" = built in today; "On request" = we build the
// connector for your business (any REST API), so nothing overclaims.
const INTEGRATIONS: SystemTile[] = [
    { key: "erpnext", name: "ERPNext", kind: "ERP", bg: "#1667D9", radius: "8px", label: "E", font: 14, status: "live" },
    { key: "email", name: "Email", kind: "SMTP / IMAP", bg: "#F59E0B", radius: "8px", label: "@", font: 15, status: "live" },
    { key: "api", name: "REST APIs", kind: "Custom tools", bg: "#334155", radius: "8px", label: "api", font: 12, mono: true, status: "live" },
    { key: "mcp", name: "MCP Servers", kind: "Tool protocol", bg: "#6366F1", radius: "8px", label: "mcp", font: 11, mono: true, status: "live" },
    { key: "quickbooks", name: "QuickBooks", kind: "Accounting", bg: "#2CA01C", radius: "50%", label: "qb", font: 11, status: "request" },
    { key: "xero", name: "Xero", kind: "Accounting", bg: "#13B5EA", radius: "50%", label: "xero", font: 10, status: "request" },
    { key: "pastel", name: "Sage Pastel", kind: "Accounting", bg: "#7C3AED", radius: "8px", label: "P", font: 14, status: "request" },
    { key: "sheets", name: "Google Sheets", kind: "Data", bg: "#0F9D58", radius: "8px", label: "⊞", font: 16, status: "request" },
];

const AGENTS = [
    { key: "finance", name: "Finance Agent", role: "Accounting & Reporting", bg: "linear-gradient(135deg, #F97316, #FBBF24)", label: "$" },
    { key: "sales", name: "Sales Agent", role: "Leads & Orders", bg: "linear-gradient(135deg, #8B5CF6, #E879F9)", label: "↗" },
    { key: "stock", name: "Stock Agent", role: "Inventory & Alerts", bg: "linear-gradient(135deg, #2563EB, #38BDF8)", label: "◆" },
    { key: "hr", name: "HR Agent", role: "People & Culture", bg: "linear-gradient(135deg, #10B981, #34D399)", label: "●●" },
];

const HERO_CHANNELS = [
    { name: "Telegram", color: "#38BDF8" },
    { name: "WhatsApp", color: "#34D399" },
    { name: "Slack", color: "#E879F9" },
    { name: "Discord", color: "#818CF8" },
    { name: "Web Chat", color: "#FB923C" },
];

const ALL_CHANNELS = [...HERO_CHANNELS, { name: "Email", color: "#FBBF24" }];

const FEATURES = [
    { color: "#A78BFA", title: "Multi-Channel", body: "Meet your team where they already are." },
    { color: "#FB923C", title: "Secure & Private", body: "Enterprise-grade security with tenant isolation." },
    { color: "#E879F9", title: "Smart Automations", body: "Schedules, reports, reminders and workflows." },
    { color: "#38BDF8", title: "Powered by Your Data", body: "Real-time insights from your business systems." },
    { color: "#34D399", title: "Built for Business", body: "Not just answers. Actions that drive results." },
];

const STATS = [
    { value: "24/7", color: "#FB923C", label: "Always-on business monitoring" },
    { value: "12+", color: "#A78BFA", label: "Systems & channels connected" },
    { value: "6", color: "#E879F9", label: "Specialist departments of agents" },
    { value: "100%", color: "#34D399", label: "Of agent actions logged & audited" },
];

const DEPARTMENTS = [
    {
        key: "finance",
        icon: "$",
        iconBg: "linear-gradient(135deg, #F97316, #FBBF24)",
        title: "Autonomous finance ops",
        body: "Monitors cashflow, unpaid invoices, supplier bills, margins and anomalies across your accounting systems.",
        prompt: `"Which suppliers are we late paying?"`,
    },
    {
        key: "customer",
        icon: "↗",
        iconBg: "linear-gradient(135deg, #8B5CF6, #E879F9)",
        title: "Customer intelligence",
        body: "Summarizes every customer's open invoices, orders, complaints, support history and risk level.",
        prompt: `"Give me a risk summary for ABC Traders."`,
    },
    {
        key: "procurement",
        icon: "◆",
        iconBg: "linear-gradient(135deg, #2563EB, #38BDF8)",
        title: "Procurement & inventory",
        body: "Detects low stock, supplier delays, over-ordering and dead stock — and recommends purchase actions.",
        prompt: `"What should we reorder this week?"`,
    },
    {
        key: "reconciliation",
        icon: "≡",
        iconBg: "linear-gradient(135deg, #10B981, #34D399)",
        title: "Cross-system reconciliation",
        body: "Compares ERPNext vs QuickBooks vs bank and payment records — and flags mismatches automatically.",
        prompt: `"Any mismatches between ERP and the bank?"`,
    },
    {
        key: "workflow",
        icon: "⚡",
        iconBg: "linear-gradient(135deg, #E879F9, #C084FC)",
        title: "Workflow automation",
        body: "Invoice overdue by 7 days? Notify sales, draft the reminder, update the CRM, escalate if unpaid.",
        prompt: "when: invoice.overdue > 7d → escalate",
    },
    {
        key: "executive",
        icon: "◎",
        iconBg: "linear-gradient(135deg, #F97316, #8B5CF6)",
        title: "Executive command center",
        body: "One question pulls from sales, finance, stock, HR, support and operations — in seconds.",
        prompt: `"What is happening in the business today?"`,
        exec: true,
    },
];

const SECURITY_ITEMS = [
    { strong: "Tenant isolation", rest: "— your data and agents never mix with anyone else's." },
    { strong: "Per-agent permissions", rest: "— each agent gets only the tools and data its role needs." },
    { strong: "SSO, two-factor & role-based access", rest: "for every human user." },
    { strong: "Full audit trails", rest: "— who did what, which tools were used, what data changed." },
    { strong: "Sovereign deployment", rest: "— run on your own infrastructure; data never leaves it." },
];

const AUDIT_ROWS: { time: string; actor: string; actorClass: string; msg: string; status: string; statusClass: string }[] = [
    { time: "09:31", actor: "finance-agent", actorClass: styles.actorFinance, msg: "read Invoices · ERPNext", status: "allowed", statusClass: styles.statusAllowed },
    { time: "09:32", actor: "finance-agent", actorClass: styles.actorFinance, msg: "drafted payment reminder", status: "allowed", statusClass: styles.statusAllowed },
    { time: "09:32", actor: "sales-agent", actorClass: styles.actorSales, msg: "updated CRM · ABC Traders", status: "allowed", statusClass: styles.statusAllowed },
    { time: "09:33", actor: "sales-agent", actorClass: styles.actorSales, msg: "attempted export Payroll data", status: "blocked", statusClass: styles.statusBlocked },
    { time: "09:34", actor: "finance-agent", actorClass: styles.actorFinance, msg: "escalated to K. Modise", status: "human", statusClass: styles.statusHuman },
    { time: "09:35", actor: "stock-agent", actorClass: styles.actorStock, msg: "scheduled reorder report", status: "allowed", statusClass: styles.statusAllowed },
];

const FAQS = [
    {
        q: "What systems does Pulse AI connect to?",
        a: "ERPNext and email are built in today, plus any system with a REST API. Accounting suites like QuickBooks, Xero and Sage Pastel, Google Sheets, or whatever your business runs — we connect on request. If your team uses it, an agent can be given controlled, permission-checked access to it as a tool.",
    },
    {
        q: "Can I control what each agent can access?",
        a: "Yes. Each agent has its own tools, memory and permissions, set by your admins. A sales agent never sees payroll; a finance agent never touches HR records unless you allow it.",
    },
    {
        q: "Where is our data hosted?",
        a: "On a dedicated deployment — including your own infrastructure for enterprise plans. Tenant isolation means your data and agents never mix with anyone else's.",
    },
    {
        q: "How do our staff actually use it?",
        a: "From wherever they already work: WhatsApp, Telegram, Slack, Discord, email, or your own branded web app. No new tool to learn.",
    },
    {
        q: "What happens when an agent is unsure?",
        a: "It escalates to a human. Agents run scheduled checks and act within their permissions — anything ambiguous, risky, or above threshold is routed to the right person for approval.",
    },
];

export default async function LandingPage() {
    const { standaloneMode } = await getDeploymentFlags();
    if (standaloneMode) {
        const session = await auth();
        redirect(session?.user ? "/dashboard/assistant" : "/login");
    }

    return (
        <div className={`${styles.page} ${sora.variable} ${instrumentSans.variable} ${jetbrainsMono.variable}`} style={{ fontFamily: "var(--font-instrument), sans-serif" }}>
            <LandingNav />

            <main>
                {/* ── Hero ─────────────────────────────────────────────────────── */}
                <section className={styles.hero}>
                    <div className={styles.heroInner}>
                        <div className={styles.heroGrid}>
                            {/* Copy */}
                            <div>
                                <h1 className={styles.heroHeadline}>
                                    Your AI workforce. Connected to your <span className={styles.heroHeadlineAccent}>business.</span>
                                </h1>
                                <p className={styles.heroSub}>
                                    Pulse AI connects your team, tools, and data with intelligent agents that answer questions, automate workflows, and drive real business results.
                                </p>
                                <div className={styles.heroCtas}>
                                    <a href={CONTACT} className={styles.btnPrimary}>
                                        Book a Demo <span aria-hidden="true">→</span>
                                    </a>
                                    <a href="#use-cases" className={styles.btnSecondary}>
                                        See How It Works
                                        <span className={styles.playIcon} aria-hidden="true">
                                            ▶
                                        </span>
                                    </a>
                                </div>
                                <div className={styles.channelChips}>
                                    {HERO_CHANNELS.map((c) => (
                                        <span key={c.name} className={styles.chip}>
                                            <span className={styles.chipDot} style={{ background: c.color }} aria-hidden="true" />
                                            {c.name}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Visual — desktop */}
                            <div className={styles.heroVisual} aria-hidden="true">
                                <svg viewBox="0 0 800 700" className={styles.connLines} preserveAspectRatio="none">
                                    <defs>
                                        <linearGradient id="flowPO" x1="0" y1="0" x2="1" y2="0">
                                            <stop offset="0" stopColor="#8B5CF6" />
                                            <stop offset="1" stopColor="#F97316" />
                                        </linearGradient>
                                        <linearGradient id="flowOP" x1="0" y1="0" x2="1" y2="0">
                                            <stop offset="0" stopColor="#F97316" />
                                            <stop offset="1" stopColor="#FB923C" />
                                        </linearGradient>
                                    </defs>
                                    <path className={styles.dashPath} d="M 170 128 C 300 128, 280 480, 372 512" stroke="url(#flowPO)" style={{ animationDuration: "1.6s", opacity: 0.8 }} />
                                    <path className={styles.dashPath} d="M 170 206 C 290 210, 270 500, 370 530" stroke="url(#flowPO)" style={{ animationDuration: "1.9s", opacity: 0.8 }} />
                                    <path className={styles.dashPath} d="M 170 284 C 280 292, 280 520, 368 548" stroke="url(#flowPO)" style={{ animationDuration: "1.5s", opacity: 0.8 }} />
                                    <path className={styles.dashPath} d="M 170 362 C 270 370, 290 545, 366 566" stroke="url(#flowPO)" style={{ animationDuration: "2.1s", opacity: 0.8 }} />
                                    <path className={styles.dashPath} d="M 452 512 C 540 470, 520 148, 612 138" stroke="url(#flowOP)" style={{ animationDuration: "1.7s", opacity: 0.85 }} />
                                    <path className={styles.dashPath} d="M 454 528 C 550 500, 530 240, 612 228" stroke="url(#flowOP)" style={{ animationDuration: "2s", opacity: 0.85 }} />
                                    <path className={styles.dashPath} d="M 454 546 C 555 530, 540 330, 612 318" stroke="url(#flowOP)" style={{ animationDuration: "1.55s", opacity: 0.85 }} />
                                    <path className={styles.dashPath} d="M 452 562 C 545 555, 545 415, 612 408" stroke="url(#flowOP)" style={{ animationDuration: "1.85s", opacity: 0.85 }} />
                                    <path className={styles.dashPath} d="M 400 368 C 400 420, 404 440, 408 470" stroke="#A78BFA" style={{ animationDuration: "1.4s", opacity: 0.6 }} />
                                </svg>

                                <div className={styles.systemsCol}>
                                    <div className={styles.colLabel} style={{ color: "#C084FC" }}>
                                        Connect your systems
                                    </div>
                                    {SYSTEMS.map((s) => (
                                        <div key={s.key} className={styles.sysCard}>
                                            <span className={styles.sysBadge} style={{ background: s.bg, borderRadius: s.radius, fontSize: s.font }}>
                                                {s.label}
                                            </span>
                                            <span className={styles.sysName}>{s.name}</span>
                                            <span className={styles.sysDot} />
                                        </div>
                                    ))}
                                    <div className={styles.andMore}>… and more</div>
                                </div>

                                <div className={styles.dashboardMock}>
                                    <div className={styles.mockRail}>
                                        <span className={styles.mockRailLogo}>
                                            <PulseLogo size={28} showText={false} />
                                        </span>
                                        <span className={styles.mockRailDotActive} />
                                        <span className={styles.mockRailDot} />
                                        <span className={styles.mockRailDot} />
                                        <span className={styles.mockRailDot} />
                                    </div>
                                    <div className={styles.mockBody}>
                                        <div className={styles.mockHeader}>
                                            <span className={styles.mockAvatar}>$</span>
                                            <div>
                                                <div className={styles.mockAgentName}>Finance Agent</div>
                                                <div className={styles.mockOnline}>
                                                    <span className={styles.mockOnlineDot} />
                                                    Online
                                                </div>
                                            </div>
                                        </div>
                                        <div className={styles.mockBubbleRow}>
                                            <div className={styles.mockBubbleUser}>Show me unpaid invoices over Rs 50,000.</div>
                                        </div>
                                        <div className={styles.mockBubbleAgent}>
                                            Found <strong>24 unpaid invoices</strong> totaling <strong className={styles.mockAmount}>Rs 1,248,000</strong>.
                                            <div className={styles.mockTable}>
                                                <div className={styles.mockTableHead}>
                                                    <span>Customer</span>
                                                    <span className={styles.mockRight}>Amount</span>
                                                    <span className={styles.mockRight}>Due</span>
                                                </div>
                                                <div className={styles.mockTableRow}>
                                                    <span>ABC Traders</span>
                                                    <span className={styles.mockRight}>Rs 320,000</span>
                                                    <span className={styles.mockDue}>May 28</span>
                                                </div>
                                                <div className={styles.mockTableRow}>
                                                    <span>Global Supplies</span>
                                                    <span className={styles.mockRight}>Rs 285,000</span>
                                                    <span className={styles.mockDue}>May 30</span>
                                                </div>
                                                <div className={styles.mockTableRow}>
                                                    <span>Prime Solutions</span>
                                                    <span className={styles.mockRight}>Rs 215,000</span>
                                                    <span className={styles.mockDueOk}>Jun 02</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.pulseCube}>
                                    <div className={styles.cubeRing} />
                                    <div className={styles.cubeRingDelay} />
                                    <div className={styles.cubeInner}>
                                        <span className={styles.cubeBar} style={{ background: "#C084FC", animation: "eq1 1.1s ease-in-out infinite" }} />
                                        <span className={styles.cubeBar} style={{ background: "#FB923C", animation: "eq2 1.1s ease-in-out infinite" }} />
                                        <span className={styles.cubeBar} style={{ background: "#E879F9", animation: "eq3 1.1s ease-in-out infinite" }} />
                                        <span className={styles.cubeBar} style={{ background: "#FB923C", animation: "eq1 1.3s ease-in-out infinite" }} />
                                        <span className={styles.cubeBar} style={{ background: "#C084FC", animation: "eq2 1.2s ease-in-out infinite" }} />
                                    </div>
                                    <div className={styles.cubePlatform} />
                                </div>

                                <div className={styles.agentsCol}>
                                    <div className={styles.colLabel} style={{ color: "#FB923C" }}>
                                        AI Agents
                                    </div>
                                    {AGENTS.map((a) => (
                                        <div key={a.key} className={styles.agentCard}>
                                            <span className={styles.agentBadge} style={{ background: a.bg }}>
                                                {a.label}
                                            </span>
                                            <span>
                                                <span className={styles.agentName}>{a.name}</span>
                                                <span className={styles.agentRole}>{a.role}</span>
                                            </span>
                                        </div>
                                    ))}
                                    <div className={styles.andMore}>… and more</div>
                                </div>
                            </div>

                            {/* Visual — mobile (simplified: systems → core → agents) */}
                            <div className={styles.heroVisualMobile} aria-hidden="true">
                                <div className={styles.mobileFlowRow}>
                                    {SYSTEMS.map((s) => (
                                        <span key={s.key} className={styles.mobileChip}>
                                            <span className={styles.sysBadge} style={{ background: s.bg, borderRadius: s.radius, fontSize: s.font, width: 22, height: 22 }}>
                                                {s.label}
                                            </span>
                                            {s.name}
                                        </span>
                                    ))}
                                </div>
                                <div className={styles.mobileArrow}>↓</div>
                                <div className={styles.mobileCubeWrap}>
                                    <div className={styles.mobileCube}>
                                        <div className={styles.cubeRing} />
                                        <div className={styles.cubeInner}>
                                            <span className={styles.cubeBar} style={{ background: "#C084FC", animation: "eq1 1.1s ease-in-out infinite" }} />
                                            <span className={styles.cubeBar} style={{ background: "#FB923C", animation: "eq2 1.1s ease-in-out infinite" }} />
                                            <span className={styles.cubeBar} style={{ background: "#E879F9", animation: "eq3 1.1s ease-in-out infinite" }} />
                                        </div>
                                    </div>
                                </div>
                                <div className={styles.mobileArrow}>↓</div>
                                <div className={styles.mobileFlowRow}>
                                    {AGENTS.map((a) => (
                                        <span key={a.key} className={styles.mobileAgentChip}>
                                            <span className={styles.agentBadge} style={{ background: a.bg, width: 22, height: 22, fontSize: 11 }}>
                                                {a.label}
                                            </span>
                                            {a.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Feature strip */}
                    <div className={styles.featureStrip}>
                        {FEATURES.map((f) => (
                            <div key={f.title} className={styles.featureItem}>
                                <span className={styles.featureDot} style={{ background: f.color }} aria-hidden="true" />
                                <span>
                                    <span className={styles.featureTitle}>{f.title}</span>
                                    <span className={styles.featureBody}>{f.body}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ── Stats ────────────────────────────────────────────────────── */}
                <div className={styles.stats}>
                    {STATS.map((s) => (
                        <div key={s.label} className={styles.statCell}>
                            <div className={styles.statNum} style={{ color: s.color }}>
                                {s.value}
                            </div>
                            <div className={styles.statLabel}>{s.label}</div>
                        </div>
                    ))}
                </div>

                {/* ── Department agents / use cases ───────────────────────────── */}
                <section className={styles.section} id="use-cases">
                    <div className={styles.sectionInner}>
                        <div>
                            <div className={styles.eyebrow}>Department agents</div>
                            <h2 className={styles.sectionTitle}>Every department. One controlled system.</h2>
                            <p className={styles.sectionLead}>Each agent has its own tools, memory, and permissions — and escalates to a human when it matters.</p>
                        </div>
                        <div className={styles.useCasesGrid}>
                            {DEPARTMENTS.map((d) => (
                                <div key={d.key} className={d.exec ? styles.useCaseCardExec : styles.useCaseCard}>
                                    <span className={styles.useCaseIcon} style={{ background: d.iconBg }} aria-hidden="true">
                                        {d.icon}
                                    </span>
                                    <h3 className={styles.useCaseTitle}>{d.title}</h3>
                                    <p className={styles.useCaseBody}>{d.body}</p>
                                    <div className={d.exec ? styles.useCasePromptExec : styles.useCasePrompt}>{d.prompt}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Integrations ─────────────────────────────────────────────── */}
                <section className={`${styles.section} ${styles.sectionAlt}`} id="integrations">
                    <div className={styles.sectionInner}>
                        <div>
                            <div className={styles.eyebrow}>Integrations</div>
                            <h2 className={styles.sectionTitle}>Connects to the systems you already run.</h2>
                            <p className={styles.sectionLead}>ERPNext, email and any REST API work today. Accounting suites like QuickBooks, Xero and Sage Pastel — or whatever your business runs — we connect for you on request.</p>
                        </div>
                        <div className={styles.integrationsGrid}>
                            {INTEGRATIONS.map((i) => (
                                <div key={i.key} className={styles.integrationTile}>
                                    <span
                                        className={styles.integrationBadge}
                                        style={{ background: i.bg, borderRadius: i.radius, fontSize: i.font, fontFamily: i.mono ? "var(--font-mono), monospace" : undefined }}
                                    >
                                        {i.label}
                                    </span>
                                    <span className={styles.integrationName}>{i.name}</span>
                                    <span className={styles.integrationKind}>{i.kind}</span>
                                    {i.status && (
                                        <span
                                            style={{
                                                display: "inline-block",
                                                marginTop: 8,
                                                fontSize: 9.5,
                                                fontWeight: 700,
                                                letterSpacing: "0.07em",
                                                textTransform: "uppercase",
                                                padding: "3px 8px",
                                                borderRadius: 20,
                                                color: i.status === "live" ? "#4ade80" : "#a5b0bd",
                                                background: i.status === "live" ? "rgba(74,222,128,0.13)" : "rgba(165,176,189,0.12)",
                                            }}
                                        >
                                            {i.status === "live" ? "Live" : "On request"}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div className={styles.channelRow}>
                            <span className={styles.channelRowLabel}>Your team talks to Pulse from</span>
                            {ALL_CHANNELS.map((c) => (
                                <span key={c.name} className={styles.pillChip}>
                                    <span className={styles.chipDot} style={{ background: c.color }} aria-hidden="true" />
                                    {c.name}
                                </span>
                            ))}
                        </div>
                    </div>
                </section>

                {/* ── Security ──────────────────────────────────────────────────── */}
                <section className={styles.section} id="security">
                    <div className={styles.sectionInner}>
                        <div className={styles.securityGrid}>
                            <div>
                                <div className={styles.eyebrow}>Security & compliance</div>
                                <h2 className={styles.sectionTitle}>Controlled. Isolated. Audited.</h2>
                                <p className={styles.sectionLead}>Admins decide exactly what each agent can see and do. Every action leaves a trail.</p>
                                <div className={styles.checklist}>
                                    {SECURITY_ITEMS.map((item) => (
                                        <div key={item.strong} className={styles.checkItem}>
                                            <span className={styles.checkIcon} aria-hidden="true">
                                                ✓
                                            </span>
                                            <span className={styles.checkText}>
                                                <strong>{item.strong}</strong> {item.rest}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className={styles.auditPanel}>
                                <div className={styles.auditHeader}>
                                    <span className={styles.auditTitle}>Audit trail</span>
                                    <span className={styles.liveBadge}>
                                        <span className={styles.liveDot} aria-hidden="true" />
                                        Live
                                    </span>
                                </div>
                                <div className={styles.auditBody}>
                                    {AUDIT_ROWS.map((row, idx) => (
                                        <div key={idx} className={styles.auditRow}>
                                            <span className={styles.auditTime}>{row.time}</span>
                                            <span className={styles.auditMsg}>
                                                <span className={row.actorClass}>{row.actor}</span> {row.msg}
                                            </span>
                                            <span className={row.statusClass}>{row.status}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── FAQ ───────────────────────────────────────────────────────── */}
                <section className={`${styles.section} ${styles.sectionAlt}`} id="faq">
                    <div className={styles.sectionInner}>
                        <div className={styles.faqGrid}>
                            <div>
                                <div className={styles.eyebrow}>FAQ</div>
                                <h2 className={styles.sectionTitle}>Questions, answered.</h2>
                                <p className={styles.sectionLead}>
                                    Something else on your mind?{" "}
                                    <a href={CONTACT} style={{ color: "#A78BFA" }}>
                                        Talk to us
                                    </a>
                                    .
                                </p>
                            </div>
                            <LandingFaq faqs={FAQS} />
                        </div>
                    </div>
                </section>
            </main>

            {/* ── Closing CTA + footer ─────────────────────────────────────────── */}
            <div className={styles.closing}>
                <div className={styles.closingInner}>
                    <h2 className={styles.closingTitle}>
                        Turn your software stack into an <span className={styles.heroHeadlineAccent}>AI-operated command center.</span>
                    </h2>
                    <p className={styles.closingLead}>Tell us about your business and we&rsquo;ll design the right team of agents for it.</p>
                    <div className={styles.closingCtas}>
                        <a href={CONTACT} className={styles.btnPrimary}>
                            Book a Demo <span aria-hidden="true">→</span>
                        </a>
                        <a href={CONTACT} className={styles.btnSecondary}>
                            Contact us
                        </a>
                    </div>
                </div>

                <footer className={styles.footer}>
                    <div className={styles.footerLogo}>
                        <PulseLogo size={30} textSize={18} />
                        <span>by Runstate</span>
                    </div>
                    <div className={styles.footerLinks}>
                        <a href={CONTACT}>Contact</a>
                        <a href="/login">Sign in</a>
                        <a href="#">Privacy</a>
                    </div>
                    <div>© 2026 Runstate Ltd</div>
                </footer>
            </div>
        </div>
    );
}
