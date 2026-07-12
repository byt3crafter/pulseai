/**
 * Shared tool approval gate — enforced on BOTH tool-execution paths:
 *  - the native runtime loop (Anthropic/OpenAI), and
 *  - the Codex operator MCP bridge (gateway/routes/mcp.ts).
 *
 * When a tool is marked "ask" in the agent's Tool Policy (and not covered by a
 * standing allowance), the call blocks until a designated approver decides via
 * the People approval workflow (Telegram Allow/Deny/Allow-always cards).
 */

import { eq } from "drizzle-orm";
import { db } from "../../storage/db.js";
import { agentProfiles } from "../../storage/schema.js";
import { ToolPolicy, isToolGated } from "./tool-policy.js";
import { createApproval, awaitDecision, hasStandingAllowance } from "../../channels/approval-service.js";
import { logger } from "../../utils/logger.js";

/** Minutes an approver has to decide before the gated call is treated as denied. */
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Human-readable summary shown on an approval card. For email it renders the
 * actual draft (to/subject/body) so the approver reviews real content; other
 * tools get a compact arg preview.
 */
export function buildApprovalSummary(agentName: string, toolName: string, input: any): string {
    const a = (input || {}) as Record<string, any>;
    const clip = (s: any, n: number) => {
        const str = typeof s === "string" ? s : JSON.stringify(s ?? "");
        return str.length > n ? str.slice(0, n) + "…" : str;
    };
    if (toolName === "email_send") {
        const to = Array.isArray(a.to) ? a.to.join(", ") : (a.to || "?");
        const lines = [`🔐 ${agentName} wants to SEND an email — approve?`, `To: ${clip(to, 200)}`];
        if (a.cc) lines.push(`Cc: ${clip(Array.isArray(a.cc) ? a.cc.join(", ") : a.cc, 200)}`);
        lines.push(`Subject: ${clip(a.subject || "(none)", 200)}`, `—`, clip(a.body || a.text || "(empty body)", 1400));
        return lines.join("\n");
    }
    if (toolName === "email_reply") {
        return [
            `🔐 ${agentName} wants to REPLY to an email (thread #${a.uid ?? "?"}) — approve?`,
            `—`,
            clip(a.body || "(empty reply)", 1400),
        ].join("\n");
    }
    const keys = Object.keys(a).filter((k) => k !== "_agentId");
    const preview = keys.slice(0, 6).map((k) => `${k}: ${clip(a[k], 160)}`).join("\n");
    return `🔐 ${agentName} wants to use the "${toolName}" tool — approve?${preview ? `\n${preview}` : ""}`;
}

export interface GateInput {
    tenantId: string;
    agentProfileId: string | null;
    toolName: string;
    args: Record<string, any>;
    channelType?: string | null;
    channelContactId?: string | null;
    /** Pass the already-loaded policy/name to skip a DB round-trip (runtime path does). */
    policy?: ToolPolicy | null;
    agentName?: string;
}

export type GateResult = { ok: true } | { ok: false; message: string };

/**
 * Returns {ok:true} to proceed, or {ok:false, message} if the caller must NOT
 * run the tool (denied / timed out / not gated-but-failed-closed). Blocks while
 * awaiting a human decision for a gated tool.
 */
export async function ensureToolApproved(input: GateInput): Promise<GateResult> {
    let policy = input.policy ?? null;
    let agentName = input.agentName;

    // Load policy/name if not supplied (the MCP path doesn't have them handy).
    if ((policy === null || !agentName) && input.agentProfileId) {
        const profile = await db.query.agentProfiles.findFirst({
            where: eq(agentProfiles.id, input.agentProfileId),
            columns: { toolPolicy: true, name: true },
        });
        if (policy === null) policy = (profile?.toolPolicy as ToolPolicy) || null;
        if (!agentName) agentName = profile?.name || "An agent";
    }

    if (!isToolGated(policy, input.toolName)) return { ok: true };

    try {
        if (await hasStandingAllowance(input.tenantId, "tool", input.toolName)) return { ok: true };
    } catch (err) {
        logger.error({ err, tool: input.toolName }, "Tool allowance lookup failed — failing closed");
    }

    let outcome: { status: string; approverLabel?: string };
    try {
        const { id } = await createApproval({
            tenantId: input.tenantId,
            kind: "tool_call",
            summary: buildApprovalSummary(agentName || "An agent", input.toolName, input.args),
            agentProfileId: input.agentProfileId ?? null,
            payload: { toolName: input.toolName, args: input.args },
            channelType: input.channelType ?? undefined,
            channelContactId: input.channelContactId ?? undefined,
            timeoutMs: APPROVAL_TIMEOUT_MS,
        });
        outcome = await awaitDecision(id, APPROVAL_TIMEOUT_MS);
    } catch (err) {
        logger.error({ err, tool: input.toolName }, "Approval workflow failed — failing closed");
        outcome = { status: "expired" };
    }

    if (outcome.status === "approved") return { ok: true };
    const reason = outcome.status === "denied"
        ? `The operator denied permission${outcome.approverLabel ? ` (${outcome.approverLabel})` : ""} to use ${input.toolName}.`
        : `Approval to use ${input.toolName} timed out.`;
    return { ok: false, message: `${reason} Tell the user you couldn't complete that action and do NOT retry the tool.` };
}
