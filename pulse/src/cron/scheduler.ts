/**
 * Cron Scheduler — manages scheduled jobs using the croner library.
 * Loads jobs from DB on init, creates cron/interval/once instances.
 */

import { Cron } from "croner";
import { getEnabledJobs } from "./job-store.js";
import { executeJob } from "./job-runner.js";
import { logger } from "../utils/logger.js";

export class CronScheduler {
    private jobs: Map<string, Cron> = new Map();
    private timers: Map<string, NodeJS.Timeout> = new Map();

    /**
     * Initialize the scheduler by loading all enabled jobs from DB.
     */
    async init(): Promise<void> {
        const enabledJobs = await getEnabledJobs();
        logger.info({ jobCount: enabledJobs.length }, "Initializing cron scheduler");

        for (const job of enabledJobs) {
            this.addJob(job);
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
                }, () => {
                    executeJob(job).catch((err) =>
                        logger.error({ err, jobId: job.id }, "Cron job execution failed")
                    );
                });
                this.jobs.set(job.id, cron);
                logger.debug({ jobId: job.id, name: job.name, cron: job.cronExpression }, "Cron job scheduled");
            } else if (job.scheduleType === "interval" && job.intervalSeconds) {
                const timer = setInterval(() => {
                    executeJob(job).catch((err) =>
                        logger.error({ err, jobId: job.id }, "Interval job execution failed")
                    );
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
