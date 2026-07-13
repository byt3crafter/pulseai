/**
 * Cron Scheduler — manages scheduled jobs using the croner library.
 * Loads jobs from DB on init, creates cron/interval/once instances.
 */

import { Cron } from "croner";
import { getEnabledJobs } from "./job-store.js";
import { executeJob } from "./job-runner.js";
import { deliverDueCommitments } from "../commitments/commitment-delivery.js";
import { expirePendingApprovals } from "../channels/approval-service.js";
import { logger } from "../utils/logger.js";

const COMMITMENT_TICK_MS = 5 * 60 * 1000; // check for due commitments every 5 min
const APPROVAL_SWEEP_MS = 60 * 1000; // expire stale queued approvals every 60s

export class CronScheduler {
    private jobs: Map<string, Cron> = new Map();
    private timers: Map<string, NodeJS.Timeout> = new Map();
    private commitmentTimer: NodeJS.Timeout | null = null;
    private approvalSweepTimer: NodeJS.Timeout | null = null;
    // Re-entrancy guards: setInterval does NOT wait for the async callback to
    // finish, so a tick slower than its period would overlap the previous run
    // and double-process the same rows. These flags skip a tick still in flight.
    private commitmentTickRunning = false;
    private approvalSweepRunning = false;
    private intervalJobRunning: Set<string> = new Set();

    /**
     * Initialize the scheduler by loading all enabled jobs from DB.
     */
    async init(): Promise<void> {
        const enabledJobs = await getEnabledJobs();
        logger.info({ jobCount: enabledJobs.length }, "Initializing cron scheduler");

        for (const job of enabledJobs) {
            this.addJob(job);
        }

        // Global tick: deliver due commitments (per each tenant's deliveryMode).
        // Guarded against overlap — a slow tick (many tenants × LLM check-ins) must
        // not let the next tick re-read the same still-pending commitments and send
        // duplicate customer messages.
        if (!this.commitmentTimer) {
            this.commitmentTimer = setInterval(() => {
                if (this.commitmentTickRunning) {
                    logger.warn("commitment delivery tick still running — skipping this interval");
                    return;
                }
                this.commitmentTickRunning = true;
                deliverDueCommitments()
                    .catch((err) => logger.error({ err }, "commitment delivery tick failed"))
                    .finally(() => { this.commitmentTickRunning = false; });
            }, COMMITMENT_TICK_MS);
        }

        // Global tick: expire queued tool approvals past their TTL.
        if (!this.approvalSweepTimer) {
            this.approvalSweepTimer = setInterval(() => {
                if (this.approvalSweepRunning) return;
                this.approvalSweepRunning = true;
                expirePendingApprovals()
                    .catch((err) => logger.error({ err }, "approval sweep failed"))
                    .finally(() => { this.approvalSweepRunning = false; });
            }, APPROVAL_SWEEP_MS);
        }
    }

    /**
     * Add a job to the scheduler.
     */
    addJob(job: any): void {
        try {
            if (job.scheduleType === "cron" && job.cronExpression) {
                const cron = new Cron(job.cronExpression, {
                    timezone: job.timezone || "UTC",
                    // Skip a scheduled run if the previous one is still executing —
                    // an agent turn can outlast a short cron period.
                    protect: true,
                }, () => {
                    executeJob(job).catch((err) =>
                        logger.error({ err, jobId: job.id }, "Cron job execution failed")
                    );
                });
                this.jobs.set(job.id, cron);
                logger.debug({ jobId: job.id, name: job.name, cron: job.cronExpression }, "Cron job scheduled");
            } else if (job.scheduleType === "interval" && job.intervalSeconds) {
                const timer = setInterval(() => {
                    // Overlap guard: setInterval won't wait for the async turn.
                    if (this.intervalJobRunning.has(job.id)) {
                        logger.warn({ jobId: job.id }, "Interval job still running — skipping this tick");
                        return;
                    }
                    this.intervalJobRunning.add(job.id);
                    executeJob(job)
                        .catch((err) => logger.error({ err, jobId: job.id }, "Interval job execution failed"))
                        .finally(() => this.intervalJobRunning.delete(job.id));
                }, job.intervalSeconds * 1000);
                this.timers.set(job.id, timer);
                logger.debug({ jobId: job.id, name: job.name, interval: job.intervalSeconds }, "Interval job scheduled");
            } else if (job.scheduleType === "once" && job.runAt) {
                const delay = new Date(job.runAt).getTime() - Date.now();
                if (delay > 0) {
                    const timer = setTimeout(() => {
                        executeJob(job).catch((err) =>
                            logger.error({ err, jobId: job.id }, "One-shot job execution failed")
                        );
                    }, delay);
                    this.timers.set(job.id, timer);
                    logger.debug({ jobId: job.id, name: job.name, runAt: job.runAt }, "One-shot job scheduled");
                }
            }
        } catch (err) {
            logger.error({ err, jobId: job.id }, "Failed to schedule job");
        }
    }

    /**
     * Remove a job from the scheduler.
     */
    removeJob(jobId: string): void {
        const cron = this.jobs.get(jobId);
        if (cron) {
            cron.stop();
            this.jobs.delete(jobId);
        }
        const timer = this.timers.get(jobId);
        if (timer) {
            clearTimeout(timer);
            clearInterval(timer);
            this.timers.delete(jobId);
        }
    }

    /**
     * Reload all jobs from DB.
     */
    async reload(): Promise<void> {
        // Stop all existing jobs
        for (const [id] of this.jobs) {
            this.removeJob(id);
        }
        for (const [id] of this.timers) {
            this.removeJob(id);
        }
        // Re-initialize
        await this.init();
    }

    /**
     * Stop all jobs.
     */
    shutdown(): void {
        if (this.commitmentTimer) {
            clearInterval(this.commitmentTimer);
            this.commitmentTimer = null;
        }
        if (this.approvalSweepTimer) {
            clearInterval(this.approvalSweepTimer);
            this.approvalSweepTimer = null;
        }
        for (const [, cron] of this.jobs) {
            cron.stop();
        }
        for (const [, timer] of this.timers) {
            clearTimeout(timer);
            clearInterval(timer);
        }
        this.jobs.clear();
        this.timers.clear();
        logger.info("Cron scheduler shut down");
    }
}

export const cronScheduler = new CronScheduler();
