/**
 * Schedule tools — let agents create, list, and cancel scheduled jobs.
 */

import { Tool } from "../tool.interface.js";
import { createJob, getJobsByAgent, toggleJob, deleteJob } from "../../../cron/job-store.js";
import { cronScheduler } from "../../../cron/scheduler.js";

export const scheduleJobTool: Tool = {
    name: "schedule_job",
    description:
        "Create a recurring scheduled job. The agent will receive the message at the specified schedule. " +
        "Use cron expressions like '0 2 * * *' (daily at 2am) or '0 8 * * 1-5' (weekdays at 8am).",
    parameters: {
        type: "object",
        properties: {
            name: { type: "string", description: "Job name (e.g., 'Daily invoice check')" },
            cron: { type: "string", description: "Cron expression (e.g., '0 2 * * *')" },
            message: { type: "string", description: "Message/instruction to execute on schedule" },
            timezone: { type: "string", description: "Timezone (default: UTC, e.g., 'Africa/Johannesburg')" },
        },
        required: ["name", "cron", "message"],
    },
    execute: async ({ tenantId, conversationId, args }) => {
        const { name, cron, message, timezone } = args;
        const agentId = (args as any)._agentId || conversationId;

        const job = await createJob({
            tenantId,
            agentId,
            name,
            scheduleType: "cron",
            cronExpression: cron,
            message,
            timezone: timezone || "UTC",
        });

        // Add to live scheduler
        cronScheduler.addJob(job);

        return { result: `Scheduled job '${name}' created (cron: ${cron}, timezone: ${timezone || "UTC"}).` };
    },
};

export const scheduleOnceTool: Tool = {
    name: "schedule_once",
    description: "Create a one-time scheduled job that runs at a specific date/time.",
    parameters: {
        type: "object",
        properties: {
            name: { type: "string", description: "Job name" },
            runAt: { type: "string", description: "ISO 8601 datetime (e.g., '2024-01-15T14:00:00Z')" },
            message: { type: "string", description: "Message/instruction to execute" },
        },
        required: ["name", "runAt", "message"],
    },
    execute: async ({ tenantId, conversationId, args }) => {
        const { name, runAt, message } = args;
        const agentId = (args as any)._agentId || conversationId;

        const job = await createJob({
            tenantId,
            agentId,
            name,
            scheduleType: "once",
            runAt: new Date(runAt),
            message,
        });

        cronScheduler.addJob(job);

        return { result: `One-time job '${name}' scheduled for ${runAt}.` };
    },
};

export const listJobsTool: Tool = {
    name: "list_jobs",
    description: "List all scheduled jobs for this agent.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async ({ conversationId, args }) => {
        const agentId = (args as any)._agentId || conversationId;
        const jobs = await getJobsByAgent(agentId);

        if (jobs.length === 0) {
            return { result: "No scheduled jobs. Use schedule_job to create one." };
        }

        const lines = jobs.map((j) => {
            const schedule = j.cronExpression || (j.intervalSeconds ? `every ${j.intervalSeconds}s` : `once at ${j.runAt}`);
            const status = j.enabled ? "enabled" : "disabled";
            const lastRun = j.lastRunAt ? new Date(j.lastRunAt).toLocaleString() : "never";
            return `- ${j.name} (${schedule}) [${status}] last run: ${lastRun} | id: ${j.id}`;
        });

        return { result: `Scheduled jobs:\n${lines.join("\n")}` };
    },
};

export const cancelJobTool: Tool = {
    name: "cancel_job",
    description: "Disable or delete a scheduled job by ID.",
    parameters: {
        type: "object",
        properties: {
            jobId: { type: "string", description: "Job ID to cancel" },
            permanent: { type: "boolean", description: "Delete permanently (default: false, just disables)" },
        },
        required: ["jobId"],
    },
    execute: async ({ args }) => {
        const { jobId, permanent = false } = args;

        cronScheduler.removeJob(jobId);

        if (permanent) {
            await deleteJob(jobId);
            return { result: `Job ${jobId} permanently deleted.` };
        }

        await toggleJob(jobId, false);
        return { result: `Job ${jobId} disabled.` };
    },
};
