import "server-only";
import { db } from "../../storage/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../../utils/admin-auth";

/**
 * Single guarded aggregate for the admin command-center overview.
 * All figures are real, read from the platform DB. Health checks are live.
 */

export interface OverviewKpis {
    revenue30d: number;
    cost30d: number;
    margin30d: number;
    marginPct: number;
    revenuePrev30d: number;
    revenueTrendPct: number | null;
    messages24h: number;
    messagesPrev24h: number;
    messagesTrendPct: number | null;
    creditsOutstanding: number;
    activeTenants: number;
    totalTenants: number;
    totalUsers: number;
    activeChannels: number;
}

export interface SeriesPoint {
    day: string;      // YYYY-MM-DD
    messages: number;
    revenue: number;
}

export interface TenantRow {
    id: string;
    name: string;
    status: string;
    balance: number;
    spend30d: number;
    margin30d: number;
    lastActiveAt: string | null;
}

export interface AttentionItem {
    kind: "balance" | "suspended" | "jobs";
    severity: "warn" | "info";
    title: string;
    detail: string;
    href: string;
}

export interface ActivityRow {
    id: string;
    tenantName: string | null;
    contactName: string | null;
    channelType: string;
    updatedAt: string | null;
}

export interface HealthRow {
    name: string;
    detail: string;
    status: "operational" | "degraded" | "unknown";
}

export interface AdminOverview {
    kpis: OverviewKpis;
    series: SeriesPoint[];
    tenants: TenantRow[];
    attention: AttentionItem[];
    activity: ActivityRow[];
    health: HealthRow[];
    authorized: boolean;
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const trend = (curr: number, prev: number): number | null =>
    prev > 0 ? ((curr - prev) / prev) * 100 : null;

const LOW_BALANCE_THRESHOLD = 10; // credits

function emptyOverview(): AdminOverview {
    return {
        kpis: {
            revenue30d: 0, cost30d: 0, margin30d: 0, marginPct: 0,
            revenuePrev30d: 0, revenueTrendPct: null,
            messages24h: 0, messagesPrev24h: 0, messagesTrendPct: null,
            creditsOutstanding: 0, activeTenants: 0, totalTenants: 0,
            totalUsers: 0, activeChannels: 0,
        },
        series: [], tenants: [], attention: [], activity: [], health: [],
        authorized: false,
    };
}

async function checkGatewayHealth(): Promise<HealthRow> {
    const base = process.env.PULSE_GATEWAY_URL || "http://pulse-gateway:8080";
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 2500);
        const res = await fetch(`${base.replace(/\/$/, "")}/health`, {
            signal: controller.signal,
            cache: "no-store",
        });
        clearTimeout(t);
        return {
            name: "API Gateway",
            detail: "Fastify service",
            status: res.ok ? "operational" : "degraded",
        };
    } catch {
        return { name: "API Gateway", detail: "Fastify service", status: "unknown" };
    }
}

export interface AdminStatus {
    gateway: "operational" | "degraded" | "unknown";
    db: "operational" | "unknown";
    tenants: number;
    messages24h: number;
}

/** Lightweight status for the terminal footer bar (cheap; safe for every page). */
export async function getAdminStatus(): Promise<AdminStatus> {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) {
        return { gateway: "unknown", db: "unknown", tenants: 0, messages24h: 0 };
    }
    try {
        const [counts, gateway] = await Promise.all([
            db.execute(sql`
                select
                    (select count(*) from tenants) as tenants,
                    (select count(*) from messages where created_at > now() - interval '24 hours') as m24
            `),
            checkGatewayHealth(),
        ]);
        const c = (counts as any)[0] ?? {};
        return {
            gateway: gateway.status,
            db: "operational",
            tenants: num(c.tenants),
            messages24h: num(c.m24),
        };
    } catch {
        return { gateway: "unknown", db: "unknown", tenants: 0, messages24h: 0 };
    }
}

export async function getAdminOverview(): Promise<AdminOverview> {
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return emptyOverview();

    try {
        const [kpiRows, msgRows, balRow, tenantCounts, userRow, channelRow, seriesRows, tenantRows, activityRows, lowBalRows, suspendedRow, jobsRow, gatewayHealth] =
            await Promise.all([
                db.execute(sql`
                    select
                        coalesce(sum(cost_usd) filter (where created_at > now() - interval '30 days'), 0) as rev30,
                        coalesce(sum(base_cost_usd) filter (where created_at > now() - interval '30 days'), 0) as cost30,
                        coalesce(sum(cost_usd) filter (where created_at > now() - interval '60 days' and created_at <= now() - interval '30 days'), 0) as rev_prev30
                    from usage_records
                `),
                db.execute(sql`
                    select
                        count(*) filter (where created_at > now() - interval '24 hours') as m24,
                        count(*) filter (where created_at > now() - interval '48 hours' and created_at <= now() - interval '24 hours') as m_prev24
                    from messages
                `),
                db.execute(sql`select coalesce(sum(balance), 0) as total from tenant_balances`),
                db.execute(sql`select count(*) as total, count(*) filter (where status = 'active') as active from tenants`),
                db.execute(sql`select count(*) as total from users`),
                db.execute(sql`select count(*) as total from channel_connections`),
                db.execute(sql`
                    select to_char(gs.day, 'YYYY-MM-DD') as day,
                        coalesce(m.msgs, 0) as messages,
                        coalesce(u.rev, 0) as revenue
                    from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') gs(day)
                    left join (select date_trunc('day', created_at) d, count(*) msgs from messages where created_at > now() - interval '14 days' group by 1) m on m.d = gs.day
                    left join (select date_trunc('day', created_at) d, sum(cost_usd) rev from usage_records where created_at > now() - interval '14 days' group by 1) u on u.d = gs.day
                    order by gs.day
                `),
                db.execute(sql`
                    select t.id, t.name, coalesce(t.status, 'active') as status,
                        coalesce(b.balance, 0) as balance,
                        coalesce(u.spend, 0) as spend30,
                        coalesce(u.margin, 0) as margin30,
                        gc.last_active
                    from tenants t
                    left join tenant_balances b on b.tenant_id = t.id
                    left join (
                        select tenant_id, sum(cost_usd) spend, sum(cost_usd - base_cost_usd) margin
                        from usage_records where created_at > now() - interval '30 days' group by 1
                    ) u on u.tenant_id = t.id
                    left join (select tenant_id, max(created_at) last_active from conversations group by 1) gc on gc.tenant_id = t.id
                    order by spend30 desc nulls last, t.created_at desc
                    limit 50
                `),
                db.execute(sql`
                    select c.id, c.contact_name, c.channel_type, c.updated_at, t.name as tenant_name
                    from conversations c
                    left join tenants t on t.id = c.tenant_id
                    order by c.updated_at desc nulls last
                    limit 8
                `),
                db.execute(sql`
                    select t.name, coalesce(b.balance, 0) as balance
                    from tenants t
                    left join tenant_balances b on b.tenant_id = t.id
                    where coalesce(t.status, 'active') = 'active' and coalesce(b.balance, 0) < ${LOW_BALANCE_THRESHOLD}
                    order by balance asc
                    limit 5
                `),
                db.execute(sql`select count(*) as total from tenants where status = 'suspended'`),
                db.execute(sql`select count(*) filter (where enabled = false) as paused from scheduled_jobs`),
                checkGatewayHealth(),
            ]);

        const k = (kpiRows as any)[0] ?? {};
        const m = (msgRows as any)[0] ?? {};
        const revenue30d = num(k.rev30);
        const cost30d = num(k.cost30);
        const margin30d = revenue30d - cost30d;
        const revenuePrev30d = num(k.rev_prev30);
        const messages24h = num(m.m24);
        const messagesPrev24h = num(m.m_prev24);

        const kpis: OverviewKpis = {
            revenue30d,
            cost30d,
            margin30d,
            marginPct: revenue30d > 0 ? (margin30d / revenue30d) * 100 : 0,
            revenuePrev30d,
            revenueTrendPct: trend(revenue30d, revenuePrev30d),
            messages24h,
            messagesPrev24h,
            messagesTrendPct: trend(messages24h, messagesPrev24h),
            creditsOutstanding: num((balRow as any)[0]?.total),
            activeTenants: num((tenantCounts as any)[0]?.active),
            totalTenants: num((tenantCounts as any)[0]?.total),
            totalUsers: num((userRow as any)[0]?.total),
            activeChannels: num((channelRow as any)[0]?.total),
        };

        const series: SeriesPoint[] = (seriesRows as any[]).map((r) => ({
            day: String(r.day),
            messages: num(r.messages),
            revenue: num(r.revenue),
        }));

        const tenants: TenantRow[] = (tenantRows as any[]).map((r) => ({
            id: String(r.id),
            name: String(r.name),
            status: String(r.status),
            balance: num(r.balance),
            spend30d: num(r.spend30),
            margin30d: num(r.margin30),
            lastActiveAt: r.last_active ? new Date(r.last_active).toISOString() : null,
        }));

        const activity: ActivityRow[] = (activityRows as any[]).map((r) => ({
            id: String(r.id),
            tenantName: r.tenant_name ? String(r.tenant_name) : null,
            contactName: r.contact_name ? String(r.contact_name) : null,
            channelType: String(r.channel_type),
            updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
        }));

        // ── Needs attention ──
        const attention: AttentionItem[] = [];
        const lowBal = lowBalRows as any[];
        if (lowBal.length > 0) {
            attention.push({
                kind: "balance",
                severity: "warn",
                title: `${lowBal.length} workspace${lowBal.length > 1 ? "s" : ""} low on credits`,
                detail: lowBal.map((r) => `${r.name} (${num(r.balance).toFixed(0)})`).join(", "),
                href: "/admin/tenants",
            });
        }
        const suspended = num((suspendedRow as any)[0]?.total);
        if (suspended > 0) {
            attention.push({
                kind: "suspended",
                severity: "info",
                title: `${suspended} workspace${suspended > 1 ? "s" : ""} suspended`,
                detail: "Review status in Tenant Management.",
                href: "/admin/tenants",
            });
        }
        const paused = num((jobsRow as any)[0]?.paused);
        if (paused > 0) {
            attention.push({
                kind: "jobs",
                severity: "info",
                title: `${paused} scheduled job${paused > 1 ? "s" : ""} paused`,
                detail: "Some automations are disabled.",
                href: "/admin/settings?tab=scheduling",
            });
        }

        // ── System health (real) ──
        const health: HealthRow[] = [
            { name: "Database", detail: "PostgreSQL via Drizzle", status: "operational" }, // reachable — this query ran
            gatewayHealth,
        ];

        return { kpis, series, tenants, attention, activity, health, authorized: true };
    } catch (error) {
        console.error("Failed to load admin overview:", error);
        return { ...emptyOverview(), authorized: true };
    }
}
