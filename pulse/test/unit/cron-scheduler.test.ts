import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CronScheduler } from "../../src/cron/scheduler.js";

// Mock the job-store and job-runner modules
vi.mock("../../src/cron/job-store.js", () => ({
    getEnabledJobs: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../src/cron/job-runner.js", () => ({
    executeJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/utils/logger.js", () => ({
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(() => ({
            info: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        })),
    },
}));

describe("CronScheduler", () => {
    let scheduler: CronScheduler;

    beforeEach(() => {
        scheduler = new CronScheduler();
    });

    afterEach(() => {
        scheduler.shutdown();
    });

    it("initializes with no jobs", async () => {
        await scheduler.init();
        // Should not throw
    });

    it("adds and removes a cron job", () => {
        const job = {
            id: "test-1",
            name: "Test Cron",
            scheduleType: "cron",
            cronExpression: "0 * * * *",
            timezone: "UTC",
        };
        scheduler.addJob(job);
        // Verify it was added by removing (no throw)
        scheduler.removeJob("test-1");
    });

    it("adds and removes an interval job", () => {
        const job = {
            id: "test-2",
            name: "Test Interval",
            scheduleType: "interval",
            intervalSeconds: 3600,
        };
        scheduler.addJob(job);
        scheduler.removeJob("test-2");
    });

    it("adds a once job with future date", () => {
        const futureDate = new Date(Date.now() + 100000);
        const job = {
            id: "test-3",
            name: "Test Once",
            scheduleType: "once",
            runAt: futureDate,
        };
        scheduler.addJob(job);
        scheduler.removeJob("test-3");
    });

    it("skips once job with past date", () => {
        const pastDate = new Date(Date.now() - 100000);
        const job = {
            id: "test-4",
            name: "Test Past",
            scheduleType: "once",
            runAt: pastDate,
        };
        // Should not throw — just silently skips
        scheduler.addJob(job);
    });

    it("removeJob is safe for non-existent job", () => {
        // Should not throw
        scheduler.removeJob("non-existent");
    });

    it("shutdown clears all jobs", () => {
        scheduler.addJob({ id: "a", name: "A", scheduleType: "cron", cronExpression: "* * * * *", timezone: "UTC" });
        scheduler.addJob({ id: "b", name: "B", scheduleType: "interval", intervalSeconds: 60 });
        scheduler.shutdown();
        // After shutdown, removing should be safe (already cleared)
        scheduler.removeJob("a");
        scheduler.removeJob("b");
    });

    it("handles invalid cron expression gracefully", () => {
        const job = {
            id: "bad-cron",
            name: "Bad Cron",
            scheduleType: "cron",
            cronExpression: "not-a-valid-cron",
            timezone: "UTC",
        };
        // Should not throw — error is caught and logged
        expect(() => scheduler.addJob(job)).not.toThrow();
    });
});
