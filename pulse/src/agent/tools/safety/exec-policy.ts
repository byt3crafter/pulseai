/**
 * Central exec policy engine.
 * Evaluates commands against safety rules before execution.
 *
 * Pipeline:
 * 1. Obfuscation detection → deny if detected
 * 2. Dangerous patterns blacklist → deny if matched
 * 3. Safe commands whitelist → allow if matched
 * 4. DB exec_policy_rules (agent → tenant → global) → apply
 * 5. Default: allow (but log for audit)
 * 6. Always write to exec_audit_log
 */

import { detectObfuscation } from "./obfuscation-detect.js";
import { checkDangerousPatterns } from "./dangerous-patterns.js";
import { checkSafeCommand } from "./safe-commands.js";
import { writeAuditLog, ExecDecisionType } from "./audit-log.js";
import { db } from "../../../storage/db.js";
import { execPolicyRules, globalSettings } from "../../../storage/schema.js";
import { eq, isNull, and, desc } from "drizzle-orm";
import { logger } from "../../../utils/logger.js";

export interface ExecDecision {
    allowed: boolean;
    reason: string;
    action: ExecDecisionType;
}

export interface ExecPolicyContext {
    tenantId: string;
    agentId?: string;
    conversationId?: string;
}

/**
 * Check if exec safety is enabled globally via globalSettings.gatewayConfig.
 * Returns true if enabled or not set (enabled by default).
 */
async function isExecSafetyEnabled(): Promise<boolean> {
    try {
        const settings = await db.query.globalSettings.findFirst({
            where: eq(globalSettings.id, "root"),
        });
        const gwConfig = settings?.gatewayConfig as any;
        // Enabled by default if not explicitly set
        return gwConfig?.exec_safety_enabled !== false;
    } catch {
        return true; // Default to enabled on error
    }
}

/**
 * Get the default policy from global settings.
 * Returns 'allow_all' | 'allowlist_only' | 'deny_all'
 */
async function getDefaultPolicy(): Promise<string> {
    try {
        const settings = await db.query.globalSettings.findFirst({
            where: eq(globalSettings.id, "root"),
        });
        const gwConfig = settings?.gatewayConfig as any;
        return gwConfig?.exec_safety_default_policy || "allow_all";
    } catch {
        return "allow_all";
    }
}

/**
 * Load DB policy rules in priority order: agent-specific → tenant-wide → global.
 */
async function loadPolicyRules(tenantId: string, agentId?: string) {
    try {
        const rules = await db
            .select()
            .from(execPolicyRules)
            .where(
                // Get rules that apply: global (null tenant), tenant-wide (null agent), or agent-specific
                // We'll filter in JS for clarity since OR with NULLs is tricky
                undefined
            )
            .orderBy(desc(execPolicyRules.priority));

        // Filter to applicable rules
        return rules.filter((r) => {
            // Global rule (no tenant, no agent)
            if (!r.tenantId && !r.agentId) return true;
            // Tenant-wide rule
            if (r.tenantId === tenantId && !r.agentId) return true;
            // Agent-specific rule
            if (r.tenantId === tenantId && agentId && r.agentId === agentId) return true;
            return false;
        });
    } catch (err) {
        logger.error({ err }, "Failed to load exec policy rules");
        return [];
    }
}

/**
 * Match a command against a pattern (supports glob-like * and regex).
 */
function matchesPattern(command: string, pattern: string): boolean {
    try {
        // If pattern starts with / treat as regex
        if (pattern.startsWith("/") && pattern.lastIndexOf("/") > 0) {
            const lastSlash = pattern.lastIndexOf("/");
            const regexStr = pattern.substring(1, lastSlash);
            const flags = pattern.substring(lastSlash + 1);
            return new RegExp(regexStr, flags).test(command);
        }
        // Otherwise treat as glob-like: * matches anything
        const escaped = pattern
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*");
        return new RegExp(`^${escaped}$`, "i").test(command.trim());
    } catch {
        // Simple substring match as fallback
        return command.includes(pattern);
    }
}

/**
 * Evaluate a command against the exec safety policy.
 */
export async function evaluate(
    command: string,
    ctx: ExecPolicyContext
): Promise<ExecDecision> {
    const { tenantId, agentId, conversationId } = ctx;

    // Check if exec safety is enabled
    const enabled = await isExecSafetyEnabled();
    if (!enabled) {
        const decision: ExecDecision = { allowed: true, reason: "Exec safety disabled globally", action: "allowed" };
        writeAuditLog({ tenantId, agentId, conversationId, command, decision: decision.action, reason: decision.reason });
        return decision;
    }

    // 1. Obfuscation detection
    const obfuscation = detectObfuscation(command);
    if (obfuscation.detected) {
        const decision: ExecDecision = {
            allowed: false,
            reason: `Obfuscation detected: ${obfuscation.reasons.join(", ")}`,
            action: "denied",
        };
        writeAuditLog({ tenantId, agentId, conversationId, command, decision: decision.action, reason: decision.reason });
        logger.warn({ tenantId, agentId, command: command.substring(0, 200), patterns: obfuscation.patterns }, "Exec denied: obfuscation");
        return decision;
    }

    // 2. Dangerous patterns blacklist
    const dangerousMatches = checkDangerousPatterns(command);
    if (dangerousMatches.length > 0) {
        const worst = dangerousMatches[0];
        const decision: ExecDecision = {
            allowed: false,
            reason: `Dangerous pattern: ${worst.description} (${worst.severity})`,
            action: "denied",
        };
        writeAuditLog({ tenantId, agentId, conversationId, command, decision: decision.action, reason: decision.reason });
        logger.warn({ tenantId, agentId, command: command.substring(0, 200), pattern: worst.description }, "Exec denied: dangerous pattern");
        return decision;
    }

    // 3. Safe commands whitelist
    const safeCheck = checkSafeCommand(command);

    // 4. DB policy rules (agent-specific → tenant-wide → global)
    const rules = await loadPolicyRules(tenantId, agentId);

    for (const rule of rules) {
        if (matchesPattern(command, rule.pattern)) {
            if (rule.ruleType === "deny") {
                const decision: ExecDecision = {
                    allowed: false,
                    reason: `Policy rule deny: ${rule.description || rule.pattern}`,
                    action: "denied",
                };
                writeAuditLog({ tenantId, agentId, conversationId, command, decision: decision.action, reason: decision.reason });
                return decision;
            }
            if (rule.ruleType === "allow") {
                const decision: ExecDecision = {
                    allowed: true,
                    reason: `Policy rule allow: ${rule.description || rule.pattern}`,
                    action: "allowed",
                };
                writeAuditLog({ tenantId, agentId, conversationId, command, decision: decision.action, reason: decision.reason });
                return decision;
            }
        }
    }

    // 5. Check default policy
    const defaultPolicy = await getDefaultPolicy();

    if (defaultPolicy === "deny_all") {
        const decision: ExecDecision = {
            allowed: false,
            reason: "Default policy: deny all",
            action: "denied",
        };
        writeAuditLog({ tenantId, agentId, conversationId, command, decision: decision.action, reason: decision.reason });
        return decision;
    }

    if (defaultPolicy === "allowlist_only") {
        if (safeCheck) {
            const decision: ExecDecision = {
                allowed: true,
                reason: `Allowlist-only mode: ${safeCheck.binary} is safe`,
                action: "allowed",
            };
            writeAuditLog({ tenantId, agentId, conversationId, command, decision: decision.action, reason: decision.reason });
            return decision;
        }
        const decision: ExecDecision = {
            allowed: false,
            reason: "Allowlist-only mode: command not in whitelist",
            action: "denied",
        };
        writeAuditLog({ tenantId, agentId, conversationId, command, decision: decision.action, reason: decision.reason });
        return decision;
    }

    // Default: allow_all — allow but log
    const reason = safeCheck
        ? `Safe binary: ${safeCheck.binary}`
        : "Default allow policy";
    const decision: ExecDecision = { allowed: true, reason, action: "allowed" };
    writeAuditLog({ tenantId, agentId, conversationId, command, decision: decision.action, reason: decision.reason });
    return decision;
}
