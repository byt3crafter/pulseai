/**
 * Playwright Browser Manager — shared session/connection logic for the
 * playwright plugin. Mirrors the ERPNext plugin's client.ts role: this is
 * where the actual browser lifecycle, SSRF guard, and tenant config live so
 * every tool file can stay thin.
 *
 * Session model: one shared Browser instance (lazy-launched, relaunched if it
 * dies), and one BrowserContext+Page per `tenantId:agentId` pair. Sessions are
 * auto-closed after 3 minutes of idleness (timer reset on every use), and can
 * also be closed explicitly via the browser_close tool or on gateway shutdown.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { existsSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { eq, and } from "drizzle-orm";
import { db } from "../../src/storage/db.js";
import { installedPlugins, tenantPluginConfigs } from "../../src/storage/schema.js";
import { credentialVault } from "../../src/agent/tools/credential-vault.js";
import { assertSafeUrl } from "../../src/agent/tools/custom-tools.js";
import { logger } from "../../src/utils/logger.js";

/** Idle session timeout — closed automatically if unused for this long. */
const IDLE_TIMEOUT_MS = 3 * 60 * 1000;

/** Default per-action timeout for navigation, clicks, fills, and extraction. */
export const ACTION_TIMEOUT_MS = 20_000;

interface BrowserSession {
    context: BrowserContext;
    page: Page;
    idleTimer: NodeJS.Timeout;
}

let browserPromise: Promise<Browser> | null = null;
const sessions = new Map<string, BrowserSession>();

function sessionKey(tenantId: string, agentId: string): string {
    return `${tenantId}:${agentId}`;
}

/**
 * Resolve the system Chromium executable — no bundled browser download.
 * Checks CHROMIUM_PATH first, then common install locations.
 */
function resolveChromiumPath(): string {
    if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

    const candidates = [
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
    ];
    for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate;
    }

    throw new Error(
        "No Chromium executable found. Install chromium on this host " +
            "(e.g. `apk add chromium` or `apt install chromium`) or set the " +
            "CHROMIUM_PATH environment variable to its full path."
    );
}

async function getBrowser(): Promise<Browser> {
    if (browserPromise) {
        const existing = await browserPromise;
        if (existing.isConnected()) return existing;
        browserPromise = null; // dead — fall through and relaunch
    }

    browserPromise = chromium.launch({
        executablePath: resolveChromiumPath(),
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    return browserPromise;
}

function scheduleIdleClose(key: string): NodeJS.Timeout {
    const timer = setTimeout(() => {
        closeSessionByKey(key).catch((err) => logger.warn({ err, key }, "Failed to close idle browser session"));
    }, IDLE_TIMEOUT_MS);
    timer.unref(); // never keep the process alive on its own
    return timer;
}

function resetIdleTimer(key: string): void {
    const session = sessions.get(key);
    if (!session) return;
    clearTimeout(session.idleTimer);
    session.idleTimer = scheduleIdleClose(key);
}

async function closeSessionByKey(key: string): Promise<void> {
    const session = sessions.get(key);
    if (!session) return;
    sessions.delete(key);
    clearTimeout(session.idleTimer);
    try {
        await session.context.close();
    } catch (err) {
        logger.warn({ err, key }, "Error closing browser context");
    }
}

/**
 * Get this agent's page, creating a fresh session (and browser, if needed)
 * when one doesn't already exist. Used by browser_navigate only — every
 * other tool operates on an existing session via getExistingPage().
 */
export async function getOrCreateSession(tenantId: string, agentId: string): Promise<Page> {
    const key = sessionKey(tenantId, agentId);
    const existing = sessions.get(key);
    if (existing && !existing.page.isClosed()) {
        resetIdleTimer(key);
        return existing.page;
    }
    if (existing) {
        await closeSessionByKey(key); // stale — page/context died underneath us
    }

    const browser = await getBrowser();
    // 1080p at 2x device scale: text in screenshots stays crisp even after
    // chat clients downscale. PNG size grows ~4x — acceptable for this use.
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(ACTION_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(ACTION_TIMEOUT_MS);

    sessions.set(key, { context, page, idleTimer: scheduleIdleClose(key) });
    return page;
}

/** Get an existing session's page, or throw if the agent hasn't navigated yet. */
export function getExistingPage(tenantId: string, agentId: string): Page {
    const key = sessionKey(tenantId, agentId);
    const session = sessions.get(key);
    if (!session || session.page.isClosed()) {
        throw new Error("No active browser session for this agent. Call browser_navigate first.");
    }
    resetIdleTimer(key);
    return session.page;
}

/** Close this agent's browser session, if any. */
export async function closeSession(tenantId: string, agentId: string): Promise<void> {
    await closeSessionByKey(sessionKey(tenantId, agentId));
}

/** Close every session and the shared browser — used on plugin/gateway shutdown. */
export async function closeAllSessions(): Promise<void> {
    const keys = Array.from(sessions.keys());
    await Promise.all(keys.map((key) => closeSessionByKey(key)));

    if (browserPromise) {
        const pending = browserPromise;
        browserPromise = null;
        try {
            const browser = await pending;
            await browser.close();
        } catch (err) {
            logger.warn({ err }, "Error closing Playwright browser");
        }
    }
}

function isPrivateIp(ip: string): boolean {
    if (
        ip === "0.0.0.0" ||
        /^127\./.test(ip) ||
        /^10\./.test(ip) ||
        /^192\.168\./.test(ip) ||
        /^169\.254\./.test(ip) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
    ) {
        return true;
    }
    const lower = ip.toLowerCase();
    return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
}

/**
 * SSRF guard for navigation. Blocks non-http(s) schemes always, and blocks
 * loopback/private/link-local/cloud-metadata hosts unless the tenant has
 * explicitly opted into private network access.
 *
 * Reuses the same hostname blocklist as the custom-tools SSRF guard
 * (src/agent/tools/custom-tools.ts#assertSafeUrl), then adds a DNS-resolution
 * check as defense-in-depth against DNS rebinding for browser navigation.
 */
export async function assertSafeNavigationUrl(raw: string, allowPrivateNetwork: boolean): Promise<URL> {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error("Invalid URL");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Only http(s) URLs are allowed");
    }

    if (allowPrivateNetwork) return url;

    // Hostname-pattern check (shared with custom tools).
    assertSafeUrl(raw);

    // Resolve and re-check the actual IP, so a hostname that only *resolves*
    // to a private address can't slip past the pattern check above.
    try {
        const { address } = await lookup(url.hostname);
        if (isPrivateIp(address)) {
            throw new Error("Requests to internal/private hosts are not allowed");
        }
    } catch (err: any) {
        if (err instanceof Error && err.message === "Requests to internal/private hosts are not allowed") throw err;
        throw new Error(`Could not resolve host "${url.hostname}"`);
    }

    return url;
}

/** Read the tenant's "allow private network" override from plugin credentials/config. */
export async function getAllowPrivateNetwork(tenantId: string): Promise<boolean> {
    try {
        const envVars = await credentialVault.getEnvVars(tenantId);
        const raw = envVars["PLAYWRIGHT_ALLOW_PRIVATE_NETWORK"];
        return (raw || "").trim().toLowerCase() === "true";
    } catch (err) {
        logger.warn({ err, tenantId }, "Failed to read playwright plugin config");
        return false;
    }
}

/**
 * Whether this plugin is enabled for the given tenant. Mirrors the dashboard's
 * own default: a globally-approved plugin is on for every tenant unless an
 * admin has added an explicit per-tenant override that disables it.
 */
export async function isPluginEnabledForTenant(tenantId: string, pluginName: string): Promise<boolean> {
    try {
        const plugin = await db.query.installedPlugins.findFirst({
            where: eq(installedPlugins.name, pluginName),
        });
        if (!plugin) return false;

        const override = await db.query.tenantPluginConfigs.findFirst({
            where: and(eq(tenantPluginConfigs.tenantId, tenantId), eq(tenantPluginConfigs.pluginId, plugin.id)),
        });
        return override ? override.enabled !== false : true;
    } catch (err) {
        logger.warn({ err, tenantId, pluginName }, "Failed to check plugin enablement");
        return true; // fail-open, same default the dashboard uses
    }
}
