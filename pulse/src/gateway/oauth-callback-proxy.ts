/**
 * OAuth callback proxy server on port 1455.
 *
 * The OpenAI Codex CLI client (app_EMoamEEZ73f0CkXaXp7hrann) only accepts
 * redirect URIs on localhost:1455. Since our dashboard runs on port 3001,
 * this tiny HTTP server catches the OAuth callback on 1455 and redirects
 * the browser to the dashboard's /auth/callback route.
 *
 * Pattern borrowed from OpenClaw's chutes-oauth.ts (createServer + waitForLocalCallback).
 */
import { createServer, type Server } from "node:http";
import { logger } from "../utils/logger.js";

const PROXY_PORT = 1455;
const DASHBOARD_ORIGIN = process.env.DASHBOARD_URL || "http://localhost:3001";

let proxyServer: Server | null = null;

export function startOAuthCallbackProxy(): void {
    if (proxyServer) return; // Already running

    proxyServer = createServer((req, res) => {
        try {
            const url = new URL(req.url ?? "/", `http://localhost:${PROXY_PORT}`);

            if (url.pathname !== "/auth/callback") {
                res.statusCode = 404;
                res.end("Not found");
                return;
            }

            // Forward all query params (code, state, error, etc.) to the dashboard
            const dashboardCallback = new URL("/auth/callback", DASHBOARD_ORIGIN);
            for (const [key, value] of url.searchParams.entries()) {
                dashboardCallback.searchParams.set(key, value);
            }

            // 302 redirect to dashboard
            res.writeHead(302, { Location: dashboardCallback.toString() });
            res.end();

            logger.info("OAuth callback received on :1455, redirected to dashboard");
        } catch (err) {
            logger.error({ err }, "OAuth callback proxy error");
            res.statusCode = 500;
            res.end("Internal error");
        }
    });

    proxyServer.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
            logger.warn("Port 1455 already in use (Codex CLI may be running) — OAuth proxy skipped");
            proxyServer = null;
        } else {
            logger.error({ err }, "OAuth callback proxy failed to start");
        }
    });

    proxyServer.listen(PROXY_PORT, "localhost", () => {
        logger.info(`OAuth callback proxy listening on http://localhost:${PROXY_PORT}/auth/callback`);
    });
}

export function stopOAuthCallbackProxy(): void {
    if (proxyServer) {
        proxyServer.close();
        proxyServer = null;
    }
}
