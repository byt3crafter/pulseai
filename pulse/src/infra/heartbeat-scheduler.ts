/**
 * Heartbeat Scheduler — manages periodic heartbeat timers for all agents.
 */

import { db } from "../storage/db.js";
import { agentProfiles } from "../storage/schema.js";
import { logger } from "../utils/logger.js";
import { isWithinActiveHours, ActiveHours } from "./heartbeat-active-hours.js";
import { runHeartbeatOnce } from "./heartbeat-runner.js";
import { AgentRuntime } from "../agent/runtime.js";

interface AgentHeartbeatState {
    agentId: string;
    tenantId: string;
    intervalMs: number;
    activeHours?: ActiveHours;
    timer: NodeJS.Timeout | null;
    lastRunAt: number;
}

export class HeartbeatScheduler {
    private agents = new Map<string, AgentHeartbeatState>();
    private agentRuntime: AgentRuntime | null = null;
    private sendCallback: ((tenantId: string, channelContactId: string, content: string) => Promise<void>) | null = null;
    private log = logger.child({ component: "heartbeat-scheduler" });

    setRuntime(runtime: AgentRuntime) {
        this.agentRuntime = runtime;
    }

    setSendCallback(cb: (tenantId: string, channelContactId: string, content: string) => Promise<void>) {
        this.sendCallback = cb;
    }

    /**
     * Load all agents with heartbeat enabled and start their timers.
     */
    async start(): Promise<void> {
        this.log.info("Starting heartbeat scheduler...");

        try {
            const profiles = await db.select().from(agentProfiles);

            for (const profile of profiles) {
                const hbConfig = profile.heartbeatConfig as any;
                if (!hbConfig?.enabled) continue;

                const intervalMs = (hbConfig.every || 3600) * 1000; // Default 1 hour
                const state: AgentHeartbeatState = {
                    agentId: profile.id,
                    tenantId: profile.tenantId,
                    intervalMs,
                    activeHours: hbConfig.activeHours,
                    timer: null,
                    lastRunAt: 0,
                };

                this.scheduleAgent(state);
                this.agents.set(profile.id, state);
            }

            this.log.info({ agentCount: this.agents.size }, "Heartbeat scheduler started");
        } catch (err) {
            this.log.error({ err }, "Failed to start heartbeat scheduler");
        }
    }

    private scheduleAgent(state: AgentHeartbeatState) {
        if (state.timer) clearInterval(state.timer);

        state.timer = setInterval(async () => {
            // Check active hours
            if (!isWithinActiveHours(state.activeHours)) {
                this.log.debug({ agentId: state.agentId }, "Outside active hours, skipping heartbeat");
                return;
            }

            if (!this.agentRuntime) {
                this.log.warn("No agent runtime set, skipping heartbeat");
                return;
            }

            state.lastRunAt = Date.now();
            await runHeartbeatOnce(
                state.agentId,
                state.tenantId,
                this.agentRuntime,
                this.sendCallback || (async () => {})
            );
        }, state.intervalMs);
    }

    /**
     * Reload configuration for all agents.
     */
    async reload(): Promise<void> {
        this.stop();
        await this.start();
    }

    /**
     * Stop all heartbeat timers.
     */
    stop(): void {
        for (const [id, state] of this.agents) {
            if (state.timer) {
                clearInterval(state.timer);
                state.timer = null;
            }
        }
        this.agents.clear();
        this.log.info("Heartbeat scheduler stopped");
    }

    getStatus(): Array<{ agentId: string; tenantId: string; intervalMs: number; lastRunAt: number }> {
        return Array.from(this.agents.values()).map(s => ({
            agentId: s.agentId,
            tenantId: s.tenantId,
            intervalMs: s.intervalMs,
            lastRunAt: s.lastRunAt,
        }));
    }
}

export const heartbeatScheduler = new HeartbeatScheduler();
