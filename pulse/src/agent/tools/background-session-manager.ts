/**
 * Background Session Manager — tracks long-running shell sessions per agent.
 * In-memory Map with TTL auto-cleanup, max 10 concurrent per tenant.
 */

import { logger } from "../../utils/logger.js";

export interface BackgroundSession {
    id: string;
    tenantId: string;
    agentId: string;
    command: string;
    status: "running" | "completed" | "failed" | "killed";
    stdout: string;
    stderr: string;
    exitCode: number | null;
    pid: number | null;
    startedAt: number;
    exitedAt: number | null;
    lastPolledOffset: number;
}

const MAX_SESSIONS_PER_TENANT = 10;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

class BackgroundSessionManager {
    private sessions = new Map<string, BackgroundSession>();
    private cleanupTimer: NodeJS.Timeout;

    constructor() {
        this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    }

    get(sessionId: string): BackgroundSession | undefined {
        return this.sessions.get(sessionId);
    }

    listForAgent(tenantId: string, agentId: string): BackgroundSession[] {
        return Array.from(this.sessions.values()).filter(
            s => s.tenantId === tenantId && s.agentId === agentId
        );
    }

    listForTenant(tenantId: string): BackgroundSession[] {
        return Array.from(this.sessions.values()).filter(s => s.tenantId === tenantId);
    }

    canCreate(tenantId: string): boolean {
        return this.listForTenant(tenantId).filter(s => s.status === "running").length < MAX_SESSIONS_PER_TENANT;
    }

    register(session: BackgroundSession): void {
        this.sessions.set(session.id, session);
    }

    appendStdout(sessionId: string, data: string): void {
        const s = this.sessions.get(sessionId);
        if (s) s.stdout += data;
    }

    appendStderr(sessionId: string, data: string): void {
        const s = this.sessions.get(sessionId);
        if (s) s.stderr += data;
    }

    complete(sessionId: string, exitCode: number | null, status: "completed" | "failed" | "killed" = "completed"): void {
        const s = this.sessions.get(sessionId);
        if (s) {
            s.status = status;
            s.exitCode = exitCode;
            s.exitedAt = Date.now();
        }
    }

    remove(sessionId: string): boolean {
        return this.sessions.delete(sessionId);
    }

    private cleanup(): void {
        const now = Date.now();
        for (const [id, session] of this.sessions) {
            if (session.status !== "running" && session.exitedAt && now - session.exitedAt > SESSION_TTL_MS) {
                this.sessions.delete(id);
                logger.debug({ sessionId: id }, "Cleaned up expired background session");
            }
        }
    }

    stop(): void {
        clearInterval(this.cleanupTimer);
    }
}

export const backgroundSessionManager = new BackgroundSessionManager();
