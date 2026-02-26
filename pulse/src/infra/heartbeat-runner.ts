/**
 * Heartbeat Runner — executes a single heartbeat for an agent.
 * Reads HEARTBEAT.md from workspace, builds prompt, calls LLM, routes response.
 */

import { AgentRuntime } from "../agent/runtime.js";
import { workspaceService } from "../agent/workspace/workspace-service.js";
import { db } from "../storage/db.js";
import { agentProfiles, channelConnections } from "../storage/schema.js";
import { eq, and } from "drizzle-orm";
import { logger } from "../utils/logger.js";
import { randomUUID } from "crypto";
import { InboundMessage } from "../channels/types.js";

// Simple dedup cache: agentId -> last message hash
const dedupCache = new Map<string, { hash: string; timestamp: number }>();
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function simpleHash(s: string): string {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        const chr = s.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0;
    }
    return hash.toString(36);
}

export async function runHeartbeatOnce(
    agentId: string,
    tenantId: string,
    agentRuntime: AgentRuntime,
    sendCallback: (tenantId: string, channelContactId: string, content: string) => Promise<void>
): Promise<void> {
    const log = logger.child({ component: "heartbeat", agentId, tenantId });

    try {
        // 1. Read heartbeat config from profile
        const profile = await db.query.agentProfiles.findFirst({
            where: and(eq(agentProfiles.id, agentId), eq(agentProfiles.tenantId, tenantId)),
        });

        if (!profile) {
            log.warn("Agent profile not found for heartbeat");
            return;
        }

        const hbConfig = profile.heartbeatConfig as any;
        if (!hbConfig?.enabled) return;

        // 2. Read HEARTBEAT.md from workspace
        const heartbeatMd = await workspaceService.readFile(tenantId, agentId, "HEARTBEAT.md");
        if (!heartbeatMd?.trim()) {
            log.debug("HEARTBEAT.md empty or missing, skipping");
            return;
        }

        // 3. Build heartbeat prompt
        const prompt = hbConfig.customPrompt ||
            `You are running a scheduled heartbeat check. Follow the instructions in your HEARTBEAT.md file:\n\n${heartbeatMd}\n\nProvide your heartbeat update. If everything is normal and there's nothing to report, respond with exactly "HEARTBEAT_OK".`;

        // 4. Build synthetic inbound message
        const targetChannel = hbConfig.targetChannel || "heartbeat";
        const inbound: InboundMessage = {
            id: randomUUID(),
            tenantId,
            agentProfileId: agentId,
            channelType: "heartbeat",
            channelContactId: targetChannel,
            contactName: "Heartbeat Scheduler",
            content: prompt,
            receivedAt: new Date().toISOString(),
        };

        // 5. Process through agent runtime (capture response)
        let capturedContent = "";
        await agentRuntime.processMessage(
            inbound,
            async (outbound) => {
                capturedContent = outbound.content;
                return { channelMessageId: randomUUID() };
            }
        );

        // 6. Strip HEARTBEAT_OK (nothing to report)
        if (capturedContent.trim() === "HEARTBEAT_OK") {
            log.debug("Heartbeat returned OK, no notification needed");
            return;
        }

        // 7. Dedup check
        const contentHash = simpleHash(capturedContent);
        const cached = dedupCache.get(agentId);
        if (cached && cached.hash === contentHash && Date.now() - cached.timestamp < DEDUP_TTL_MS) {
            log.debug("Heartbeat content identical to recent, skipping");
            return;
        }
        dedupCache.set(agentId, { hash: contentHash, timestamp: Date.now() });

        // 8. Route to target channel
        if (targetChannel !== "heartbeat" && sendCallback) {
            await sendCallback(tenantId, targetChannel, capturedContent);
        }

        log.info({ contentLength: capturedContent.length }, "Heartbeat executed successfully");
    } catch (err) {
        log.error({ err }, "Heartbeat execution failed");
    }
}
