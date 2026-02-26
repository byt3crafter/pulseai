import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the dependencies
vi.mock("../../src/cron/job-store.js", () => ({
    createJob: vi.fn().mockResolvedValue({ id: "job-1", name: "Test Job" }),
    getJobsByAgent: vi.fn().mockResolvedValue([]),
    toggleJob: vi.fn().mockResolvedValue(undefined),
    deleteJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/cron/scheduler.js", () => ({
    cronScheduler: {
        addJob: vi.fn(),
        removeJob: vi.fn(),
    },
}));

import { scheduleJobTool, scheduleOnceTool, listJobsTool, cancelJobTool } from "../../src/agent/tools/built-in/schedule.js";
import { createJob, getJobsByAgent, toggleJob, deleteJob } from "../../src/cron/job-store.js";
import { cronScheduler } from "../../src/cron/scheduler.js";

describe("Schedule Tools", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("schedule_job", () => {
        it("has correct name and parameters", () => {
            expect(scheduleJobTool.name).toBe("schedule_job");
            expect(scheduleJobTool.parameters.required).toContain("name");
            expect(scheduleJobTool.parameters.required).toContain("cron");
            expect(scheduleJobTool.parameters.required).toContain("message");
        });

        it("creates a cron job and adds to scheduler", async () => {
            const result = await scheduleJobTool.execute({
                tenantId: "t1",
                conversationId: "c1",
                args: { name: "Daily Report", cron: "0 8 * * *", message: "Generate report", _agentId: "a1" },
            });

            expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
                tenantId: "t1",
                name: "Daily Report",
                scheduleType: "cron",
                cronExpression: "0 8 * * *",
                message: "Generate report",
            }));
            expect(cronScheduler.addJob).toHaveBeenCalled();
            expect(result.result).toContain("Daily Report");
        });
    });

    describe("schedule_once", () => {
        it("has correct name and parameters", () => {
            expect(scheduleOnceTool.name).toBe("schedule_once");
            expect(scheduleOnceTool.parameters.required).toContain("name");
            expect(scheduleOnceTool.parameters.required).toContain("runAt");
            expect(scheduleOnceTool.parameters.required).toContain("message");
        });

        it("creates a one-time job", async () => {
            const result = await scheduleOnceTool.execute({
                tenantId: "t1",
                conversationId: "c1",
                args: { name: "Reminder", runAt: "2026-03-01T14:00:00Z", message: "Check invoices", _agentId: "a1" },
            });

            expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
                scheduleType: "once",
                name: "Reminder",
            }));
            expect(result.result).toContain("Reminder");
        });
    });

    describe("list_jobs", () => {
        it("returns empty message when no jobs", async () => {
            (getJobsByAgent as any).mockResolvedValue([]);
            const result = await listJobsTool.execute({
                tenantId: "t1",
                conversationId: "c1",
                args: { _agentId: "a1" },
            });
            expect(result.result).toContain("No scheduled jobs");
        });

        it("lists existing jobs", async () => {
            (getJobsByAgent as any).mockResolvedValue([
                { id: "j1", name: "Daily Check", cronExpression: "0 8 * * *", enabled: true, lastRunAt: null },
                { id: "j2", name: "Weekly Report", intervalSeconds: 604800, enabled: false, lastRunAt: new Date().toISOString() },
            ]);

            const result = await listJobsTool.execute({
                tenantId: "t1",
                conversationId: "c1",
                args: { _agentId: "a1" },
            });

            expect(result.result).toContain("Daily Check");
            expect(result.result).toContain("Weekly Report");
            expect(result.result).toContain("enabled");
            expect(result.result).toContain("disabled");
        });
    });

    describe("cancel_job", () => {
        it("disables job by default (not permanent)", async () => {
            const result = await cancelJobTool.execute({
                tenantId: "t1",
                conversationId: "c1",
                args: { jobId: "j1" },
            });

            expect(cronScheduler.removeJob).toHaveBeenCalledWith("j1");
            expect(toggleJob).toHaveBeenCalledWith("j1", false);
            expect(result.result).toContain("disabled");
        });

        it("permanently deletes when permanent=true", async () => {
            const result = await cancelJobTool.execute({
                tenantId: "t1",
                conversationId: "c1",
                args: { jobId: "j1", permanent: true },
            });

            expect(cronScheduler.removeJob).toHaveBeenCalledWith("j1");
            expect(deleteJob).toHaveBeenCalledWith("j1");
            expect(result.result).toContain("permanently deleted");
        });
    });
});
