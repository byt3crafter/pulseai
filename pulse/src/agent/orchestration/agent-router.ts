/**
 * Agent Router — priority-based rule engine for multi-agent message routing.
 *
 * Evaluates routing rules in priority order (lowest number = highest priority).
 * Rule types: contact, group, keyword, channel_default.
 * Feature is gated per tenant via tenants.config.multi_agent_routing_enabled.
 * Rules are cached in-memory for 15 seconds per tenant.
 */

import { db } from "../../storage/db.js";
import { routingRules, tenants } from "../../storage/schema.js";
import { eq, and, asc } from "drizzle-orm";
import { logger } from "../../utils/logger.js";
import type { InboundMessage } from "../../channels/types.js";

// 15-second in-memory cache
const CACHE_TTL = 15_000;

interface Rule {
    id: string;
    agentProfileId: string;
    ruleType: string;
    matchValue: string;
    priority: number;
}

// Rule cache per tenant
const ruleCache = new Map<string, { rules: Rule[]; loadedAt: number }>();

// Feature-flag cache per tenant
const featureCache = new Map<string, { enabled: boolean; loadedAt: number }>();

async function isRoutingEnabled(tenantId: string): Promise<boolean> {
    const cached = featureCache.get(tenantId);
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL) return cached.enabled;

    const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
    });
    const enabled = !!(tenant?.config as any)?.multi_agent_routing_enabled;
    featureCache.set(tenantId, { enabled, loadedAt: Date.now() });
    return enabled;
}

async function loadRules(tenantId: string): Promise<Rule[]> {
    const cached = ruleCache.get(tenantId);
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL) return cached.rules;

    const rows = await db
        .select({
            id: routingRules.id,
            agentProfileId: routingRules.agentProfileId,
            ruleType: routingRules.ruleType,
            matchValue: routingRules.matchValue,
            priority: routingRules.priority,
        })
        .from(routingRules)
        .where(and(eq(routingRules.tenantId, tenantId), eq(routingRules.enabled, true)))
        .orderBy(asc(routingRules.priority));

    ruleCache.set(tenantId, { rules: rows, loadedAt: Date.now() });
    return rows;
}

function matchRule(rule: Rule, msg: InboundMessage): boolean {
    switch (rule.ruleType) {
        case "contact":
            return (
                msg.channelContactId === rule.matchValue ||
                (msg.isGroup === true && msg.senderUserId === rule.matchValue)
            );
        case "group":
            return msg.isGroup === true && msg.channelContactId === rule.matchValue;
        case "keyword":
            try {
                return new RegExp(rule.matchValue, "i").test(msg.content);
            } catch {
                return false;
            }
        case "channel_default":
            return msg.channelType === rule.matchValue;
        default:
            return false;
    }
}

/**
 * Resolve which agent should handle a message.
 *
 * If multi-agent routing is enabled for the tenant, evaluates rules in priority
 * order and returns the first matching agent. Otherwise falls through to the
 * channel's default agent (or null for tenant-level fallback).
 */
export async function resolveAgent(msg: InboundMessage): Promise<string | null> {
    // If routing not enabled for this tenant, preserve existing behavior
    if (!(await isRoutingEnabled(msg.tenantId))) {
        return msg.agentProfileId || null;
    }

    const rules = await loadRules(msg.tenantId);

    for (const rule of rules) {
        if (matchRule(rule, msg)) {
            logger.debug(
                {
                    tenantId: msg.tenantId,
                    ruleId: rule.id,
                    ruleType: rule.ruleType,
                    agentId: rule.agentProfileId,
                },
                "Routing rule matched"
            );
            return rule.agentProfileId;
        }
    }

    // No rule matched — fall through to existing behavior
    return msg.agentProfileId || null;
}
