import { describe, it, expect, vi, beforeEach } from "vitest";

const countUnreadEmails = vi.fn();
const resolveEmailConfig = vi.fn();

vi.mock("../channels/email/email-service.js", () => ({
    countUnreadEmails: (...a: any[]) => countUnreadEmails(...a),
    resolveEmailConfig: (...a: any[]) => resolveEmailConfig(...a),
}));

const { shouldRun } = await import("../cron/job-runner.js");
const quiet = { warn: () => {}, info: () => {} } as any;
const job = { id: "j1", tenantId: "t1", agentId: "a1", precondition: "email_unread" };

describe("scheduled job preconditions", () => {
    beforeEach(() => {
        countUnreadEmails.mockReset();
        resolveEmailConfig.mockReset();
        resolveEmailConfig.mockResolvedValue({ imap: { host: "h", port: 993, username: "u", password: "p", tls: true } });
    });

    it("runs a job that has no precondition", async () => {
        expect((await shouldRun({ ...job, precondition: null }, quiet)).run).toBe(true);
        // and does not go anywhere near the mail server to decide that
        expect(resolveEmailConfig).not.toHaveBeenCalled();
    });

    it("skips the agent when the inbox is empty — the whole point", async () => {
        countUnreadEmails.mockResolvedValue(0);
        const r = await shouldRun(job, quiet);
        expect(r.run).toBe(false);
        expect(r.reason).toBe("inbox empty");
    });

    it("runs when there is mail", async () => {
        countUnreadEmails.mockResolvedValue(3);
        const r = await shouldRun(job, quiet);
        expect(r.run).toBe(true);
        expect(r.reason).toContain("3");
    });

    /*
     * The next three are the ones that matter. A precondition is an
     * optimisation, and an optimisation must never be why work silently stops
     * happening — so every failure path has to fall through to running.
     */
    it("runs anyway when the probe throws", async () => {
        countUnreadEmails.mockRejectedValue(new Error("connection refused"));
        expect((await shouldRun(job, quiet)).run).toBe(true);
    });

    it("runs anyway when no mailbox is configured", async () => {
        resolveEmailConfig.mockResolvedValue(null);
        expect((await shouldRun(job, quiet)).run).toBe(true);
    });

    it("runs anyway on a precondition it does not recognise", async () => {
        expect((await shouldRun({ ...job, precondition: "someday_maybe" }, quiet)).run).toBe(true);
    });
});
