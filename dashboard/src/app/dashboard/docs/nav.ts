/**
 * Docs navigation manifest.
 *
 * Each entry maps a URL slug to a markdown file in `src/content/docs/`.
 * The file name is always `<slug with / replaced by -->.md` — e.g. the slug
 * "setup/telegram" lives in `src/content/docs/setup--telegram.md`.
 *
 * This flat naming keeps the loader trivial (no recursive directory walk) and
 * makes the full page list statically enumerable for `generateStaticParams`.
 */

export interface DocPage {
    slug: string; // "" = /docs index
    title: string;
    description: string;
}

export interface DocSection {
    title: string;
    pages: DocPage[];
}

export const DOCS_NAV: DocSection[] = [
    {
        title: "Getting started",
        pages: [
            { slug: "", title: "Introduction", description: "What Pulse is, and how the pieces fit together." },
            { slug: "quickstart", title: "Quickstart", description: "From an empty workspace to an agent that answers you, in ten minutes." },
            { slug: "concepts", title: "Core concepts", description: "Agents, channels, tools, approvals — the vocabulary you need." },
        ],
    },
    {
        title: "Connect your channels",
        pages: [
            { slug: "setup--providers", title: "AI providers", description: "Give your agents a brain: Anthropic, OpenAI, Codex and others." },
            { slug: "setup--telegram", title: "Telegram", description: "Give an agent its own Telegram bot so your team can talk to it." },
            { slug: "setup--email", title: "Email (SMTP & IMAP)", description: "Let an agent send, read and reply to email." },
        ],
    },
    {
        title: "Agents",
        pages: [
            { slug: "agents--profile", title: "Profile, Soul & Identity", description: "Who the agent is, how it thinks, and how it writes." },
            { slug: "agents--tools", title: "Tools & Skills", description: "What an agent is allowed to do, and how to switch capabilities on." },
            { slug: "agents--tool-policy", title: "Tool Policy", description: "Allow, deny, and require-approval rules for every tool call." },
            { slug: "agents--memory", title: "Memory", description: "What an agent remembers between conversations." },
        ],
    },
    {
        title: "Approvals & people",
        pages: [
            { slug: "approvals", title: "Approval gates", description: "Make an agent ask a human before it acts." },
            { slug: "people", title: "People & approvers", description: "Who the agent knows, and who is allowed to sign things off." },
        ],
    },
    {
        title: "Automation",
        pages: [
            { slug: "automation--standing-orders", title: "Standing Orders", description: "Always-on operating rules the agent follows on every run." },
            { slug: "automation--schedules", title: "Schedules & cron", description: "Run an agent on a timer — inbox checks, reports, reminders." },
            { slug: "automation--commitments", title: "Commitments & follow-ups", description: "The agent tracks what it promised and chases it down." },
            { slug: "automation--heartbeat", title: "Heartbeat", description: "A recurring self-check that keeps an agent proactive." },
        ],
    },
    {
        title: "Tools & infrastructure",
        pages: [
            { slug: "tools--custom", title: "Custom Tools", description: "Connect your own HTTP API as an agent tool — no code." },
            { slug: "tools--mcp", title: "MCP servers", description: "Attach any Model Context Protocol server." },
            { slug: "tools--servers", title: "Servers (SSH)", description: "Let an agent operate a real server, under guard rails." },
            { slug: "tools--plugins", title: "Plugins", description: "ERPNext, OneDrive, web search, voice, image generation, browser." },
        ],
    },
    {
        title: "Organisation",
        pages: [
            { slug: "departments", title: "Departments & channels", description: "Model your company as an org chart of agents." },
            { slug: "routing", title: "Message routing", description: "Decide which agent answers which message." },
        ],
    },
    {
        title: "Recipes",
        pages: [
            { slug: "recipes--cfo-email", title: "The CFO email loop", description: "An agent that checks its inbox, drafts a reply, and waits for your approval." },
        ],
    },
    {
        title: "Reference",
        pages: [
            { slug: "security", title: "Security & your data", description: "How your credentials and data are protected, and who can do what." },
        ],
    },
];

export const ALL_DOCS: DocPage[] = DOCS_NAV.flatMap((s) => s.pages);

export function findDoc(slug: string): DocPage | undefined {
    return ALL_DOCS.find((p) => p.slug === slug);
}

/** "setup--telegram" is both the file name and the URL segment list ["setup","telegram"]. */
export function slugToSegments(slug: string): string[] {
    return slug ? slug.split("--") : [];
}

export function segmentsToSlug(segments: string[] | undefined): string {
    return (segments || []).join("--");
}

export function docHref(slug: string): string {
    return slug ? `/dashboard/docs/${slugToSegments(slug).join("/")}` : "/dashboard/docs";
}
