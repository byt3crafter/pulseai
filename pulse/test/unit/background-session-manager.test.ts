import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { backgroundSessionManager } from "../../src/agent/tools/background-session-manager.js";
import type { BackgroundSession } from "../../src/agent/tools/background-session-manager.js";

function makeSession(overrides: Partial<BackgroundSession> = {}): BackgroundSession {
    return {
        id: `sess-${Math.random().toString(36).slice(2, 8)}`,
        tenantId: "tenant1",
        agentId: "agent1",
        command: "echo hello",
        status: "running",
        stdout: "",
        stderr: "",
        exitCode: null,
        pid: 1234,
        startedAt: Date.now(),
        exitedAt: null,
        lastPolledOffset: 0,
        ...overrides,
    };
}

describe("BackgroundSessionManager", () => {
    // Track session IDs for cleanup
    const registeredIds: string[] = [];

    function registerSession(overrides: Partial<BackgroundSession> = {}): BackgroundSession {
        const session = makeSession(overrides);
        backgroundSessionManager.register(session);
        registeredIds.push(session.id);
        return session;
    }

    afterEach(() => {
        // Clean up all sessions we registered
        for (const id of registeredIds) {
            backgroundSessionManager.remove(id);
        }
        registeredIds.length = 0;
    });

    it("can register and retrieve a session", () => {
        const session = registerSession();
        expect(session.id).toBeDefined();
        expect(session.tenantId).toBe("tenant1");
        expect(session.agentId).toBe("agent1");
        expect(session.command).toBe("echo hello");
        expect(session.status).toBe("running");
        expect(session.pid).toBe(1234);

        const retrieved = backgroundSessionManager.get(session.id);
        expect(retrieved).toBe(session);
    });

    it("returns undefined for unknown session ID", () => {
        expect(backgroundSessionManager.get("nonexistent")).toBeUndefined();
    });

    it("lists sessions scoped to agent + tenant", () => {
        registerSession({ tenantId: "tenant1", agentId: "agent1", command: "cmd1", pid: 100 });
        registerSession({ tenantId: "tenant1", agentId: "agent1", command: "cmd2", pid: 101 });
        registerSession({ tenantId: "tenant1", agentId: "agent2", command: "cmd3", pid: 102 });
        registerSession({ tenantId: "tenant2", agentId: "agent1", command: "cmd4", pid: 103 });

        const list = backgroundSessionManager.listForAgent("tenant1", "agent1");
        expect(list).toHaveLength(2);
        expect(list.map(s => s.command)).toEqual(["cmd1", "cmd2"]);
    });

    it("lists all sessions for a tenant", () => {
        registerSession({ tenantId: "tenant1", agentId: "agent1", command: "cmd1" });
        registerSession({ tenantId: "tenant1", agentId: "agent2", command: "cmd2" });
        registerSession({ tenantId: "tenant2", agentId: "agent1", command: "cmd3" });

        const list = backgroundSessionManager.listForTenant("tenant1");
        expect(list).toHaveLength(2);
    });

    it("enforces max sessions per tenant (10)", () => {
        for (let i = 0; i < 10; i++) {
            registerSession({ tenantId: "t-max", agentId: "agent1", command: `cmd${i}`, pid: 100 + i });
        }
        expect(backgroundSessionManager.canCreate("t-max")).toBe(false);

        // Different tenant is still fine
        expect(backgroundSessionManager.canCreate("t-other")).toBe(true);
    });

    it("appends stdout/stderr", () => {
        const session = registerSession();
        backgroundSessionManager.appendStdout(session.id, "line1\n");
        backgroundSessionManager.appendStdout(session.id, "line2\n");
        backgroundSessionManager.appendStderr(session.id, "err\n");

        expect(session.stdout).toBe("line1\nline2\n");
        expect(session.stderr).toBe("err\n");
    });

    it("completes a session with exit code", () => {
        const session = registerSession();
        backgroundSessionManager.complete(session.id, 0);

        expect(session.status).toBe("completed");
        expect(session.exitCode).toBe(0);
        expect(session.exitedAt).toBeDefined();
    });

    it("removes a session", () => {
        const session = registerSession();
        backgroundSessionManager.remove(session.id);
        registeredIds.pop(); // Already removed
        expect(backgroundSessionManager.get(session.id)).toBeUndefined();
    });

    it("completed session frees up slot for canCreate", () => {
        for (let i = 0; i < 10; i++) {
            registerSession({ tenantId: "t-free", agentId: "agent1", command: `cmd${i}`, pid: 100 + i });
        }
        expect(backgroundSessionManager.canCreate("t-free")).toBe(false);

        // Complete one session — frees the "running" slot
        const sessions = backgroundSessionManager.listForTenant("t-free");
        backgroundSessionManager.complete(sessions[0].id, 0);

        expect(backgroundSessionManager.canCreate("t-free")).toBe(true);
    });
});
