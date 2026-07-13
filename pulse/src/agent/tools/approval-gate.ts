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
import { createApproval, hasStandingAllowance } from "../../channels/approval-service.js";
import { logger } from "../../utils/logger.js";

/**
 * How long a queued approval stays actionable. Non-blocking: the agent's turn
 * ends immediately, the operator can tap Allow anytime within this window, and
 * the action runs then (out-of-band). Generous because approvals often come from
 * a background check when nobody's watching the screen.
 */
const APPROVAL_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

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
 * Returns {ok:true} to run the tool now, or {ok:false, message} if it must NOT
 * run now. NON-BLOCKING: a gated tool is queued for approval and this returns
 * immediately with a "queued" message — the agent's turn ends, and the action
 * runs out-of-band when an approver taps Allow (see decide() → runApprovedToolCall).
 * A standing allowance short-circuits to {ok:true} so it runs inline.
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

    try {
        await createApproval({
            tenantId: input.tenantId,
            kind: "tool_call",
            summary: buildApprovalSummary(agentName || "An agent", input.toolName, input.args),
            agentProfileId: input.agentProfileId ?? null,
            payload: { toolName: input.toolName, args: input.args },
            channelType: input.channelType ?? undefined,
            channelContactId: input.channelContactId ?? undefined,
            timeoutMs: APPROVAL_TTL_MS,
        });
    } catch (err) {
        logger.error({ err, tool: input.toolName }, "Failed to queue approval — failing closed");
        return { ok: false, message: `Couldn't queue "${input.toolName}" for approval. Tell the user you couldn't complete that action and do NOT retry.` };
    }

    return {
        ok: false,
        message:
            `⏳ "${input.toolName}" has been sent to an approver for sign-off and will run automatically once they approve. ` +
            `Tell the user you've prepared it and it's awaiting approval — do NOT retry the tool or attempt a workaround.`,
    };
}
