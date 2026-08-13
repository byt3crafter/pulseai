/**
 * Truth Gate — stops the agent from telling the user it did something it did not
 * actually do. A weak model will happily write "Done, quote created!" with no
 * successful tool call behind it; prompting can't reliably prevent that, so this
 * is a deterministic-triggered verification pass that runs AFTER the reply is
 * drafted and BEFORE the user sees it.
 *
 * How it works:
 *  1. We track every tool call this turn and whether it actually succeeded.
 *  2. If the draft reply CLAIMS a completed action but NO state-changing tool
 *     succeeded to back it, we ask the model (given the real tool results as
 *     ground truth) to rewrite the reply truthfully.
 *  3. On any failure the original reply is returned — the gate never blocks.
 */

export interface ToolOutcome {
    name: string;
    ok: boolean;
    result: string;
}

/** Tools that CHANGE state or act on the outside world. A completion claim is
 *  only trustworthy if one of these actually succeeded. Reads are NOT listed —
 *  listing a read here would wrongly let "I sent it" pass on a mere lookup.
 *  Missing a write here only makes the gate run more often (safe). */
export const CONSEQUENTIAL_TOOLS = new Set<string>([
    // ERPNext writes
    "erpnext_create", "erpnext_update", "erpnext_delete", "erpnext_method",
    // Email actions
    "email_send", "email_reply", "email_draft", "email_delete", "email_move", "email_flag", "email_configure",
    // CRM / calendar
    "contact_save", "contact_delete", "calendar_add", "calendar_delete",
    // Quick-capture writes
    "note_save", "note_delete", "todo_add", "todo_complete", "todo_delete",
    "bookmark_save", "bookmark_delete", "expense_add", "expense_delete",
    "task_create", "task_update", "task_complete", "task_delete",
    // Documents / PDF / vault
    "document_delete", "pdf_fill_form", "login_save",
    // Config / integrations (state-changing setup)
    "credential_set", "erpnext_connect", "erpnext_create", "erpnext_update", "erpnext_delete",
    // OneDrive
    "onedrive_upload", "onedrive_create_folder", "onedrive_share", "onedrive_delete",
    // Scheduling / commitments / self-edit / browser side-effects
    "schedule_job", "schedule_once", "cancel_job", "commitment_create", "commitment_complete",
    "workspace_update", "browser_login", "browser_fill",
    // Proactive outreach / follow-ups
    "notify", "commitment_create", "commitment_complete", "schedule_job", "schedule_once",
]);

// Match FIRST-PERSON completed-action claims ("I created…", "I've sent…",
// "Done — saved it") — the shape a lie actually takes. Deliberately NOT tripping
// on recommendation/imperative verbs ("Refresh the pack", "Get us registered"),
// descriptive prose about third parties ("the Act was updated"), or offers
// ("want me to save this?"), which are not completion claims and were causing
// the gate to fire (and rewrite) on ordinary research/advisory answers.
const COMPLETION_RE = /\bI(?:['’]ve| have| just| already| now)*\s+(?:successfully\s+)?(?:created|sent|saved?|configured|set\s+up|updated?|deleted?|removed?|booked|scheduled?|filled(?:\s+(?:in|out))?|attached?|added|posted?|submitted?|uploaded?|shared?|issued?|generated?|logged|recorded?|assigned?|moved|flagged?|marked?)\b|(?:^|[.!?]\s+)(?:done|all set|all done)\b/i;

/** Does the reply assert that an action was carried out? (cheap pre-filter) */
export function claimsCompletion(reply: string): boolean {
    return COMPLETION_RE.test(reply);
}

/** Result strings from tools that signal failure rather than success. */
export function isErrorResult(s: string): boolean {
    if (!s || !s.trim()) return true;
    const t = s.trim();
    if (/^error\b/i.test(t)) return true;
    if (/^\{?\s*"?error"?\s*:/i.test(t)) return true;
    if (/^(failed|could ?n[o']?t|unable to|no such|not found|invalid|missing)\b/i.test(t)) return true;
    if (/"error"\s*:/.test(t.slice(0, 200))) return true;
    return false;
}

/**
 * Decide whether the gate needs to run. Runs only when the reply claims a
 * completed action AND no state-changing tool actually succeeded this turn —
 * i.e. exactly the situation where a "done" would be a lie. When a real write
 * succeeded we trust the reply and skip (keeps cost/latency off the happy path).
 */
export function shouldRunGate(reply: string, outcomes: ToolOutcome[]): boolean {
    if (!reply || !reply.trim()) return false;
    if (!claimsCompletion(reply)) return false;
    // A turn that ran only READ-ONLY tools (e.g. web_search/web_fetch) and
    // attempted NO state-changing tool cannot be lying about having performed an
    // action — skip the gate so research/advisory answers pay no latency and
    // aren't at risk of a rewrite. (A turn with no tools at all still gates: that
    // is the classic "Done, quote created!" with nothing behind it.)
    const attemptedConsequential = outcomes.some((o) => CONSEQUENTIAL_TOOLS.has(o.name));
    const ranReadOnlyTool = outcomes.some((o) => o.ok && !CONSEQUENTIAL_TOOLS.has(o.name));
    if (ranReadOnlyTool && !attemptedConsequential) return false;
    const hasSuccessfulWrite = outcomes.some((o) => o.ok && CONSEQUENTIAL_TOOLS.has(o.name));
    return !hasSuccessfulWrite;
}

const GATE_SYSTEM = `You are a strict truthfulness checker sitting between an AI assistant and its user.

You are given (a) the ACTUAL results of every tool the assistant ran this turn — this is the ground truth of what really happened — and (b) the assistant's DRAFT reply to the user.

Your ONLY job: make sure the draft never claims an action was COMPLETED unless a tool result actually confirms it succeeded. Claims to watch: created/sent/saved/configured/updated/deleted/booked/scheduled/filled/attached/added/submitted/uploaded/shared/issued/generated/logged/recorded/assigned/etc.

Rules:
- If every completed-action claim in the draft is backed by a SUCCESSFUL tool result (or the draft makes no such claims), the draft is fine.
- If the draft claims something was done that the tool results do NOT confirm (no matching tool ran, or it returned an error/failure), the draft is LYING and must be fixed.
- When fixing: rewrite so it truthfully says what actually happened — e.g. "I wasn't able to create the quote yet" or "I couldn't send that" — keep the assistant's tone, keep every part that IS supported, and never invent success. Prefer offering the real next step (e.g. "want me to pull it now?").
- NEVER add success that the results don't show.
- Write for the end user in natural language. Do NOT mention "tools", "this turn", "tool results", or any internal mechanics — the user doesn't know or care about those. Just say plainly what did or didn't happen.

Output format:
- If nothing needs fixing, output exactly: PASS
- Otherwise output the full corrected reply and nothing else (no preamble, no quotes, no explanation).`;

/**
 * Run the gate. `chat` is a closure that sends (system, user) to the model and
 * returns its text. Returns the (possibly corrected) reply. Never throws.
 */
export async function runTruthGate(params: {
    reply: string;
    outcomes: ToolOutcome[];
    chat: (system: string, user: string) => Promise<string>;
    log?: (msg: string, data?: Record<string, unknown>) => void;
}): Promise<{ reply: string; corrected: boolean }> {
    const { reply, outcomes, chat } = params;
    const outcomeText = outcomes.length
        ? outcomes.map((o, i) => `${i + 1}. ${o.name} → ${o.ok ? "SUCCESS" : "FAILED"}: ${o.result.replace(/\s+/g, " ").slice(0, 500)}`).join("\n")
        : "(nothing was actually performed — no action was carried out)";
    const user = `TOOL RESULTS THIS TURN (ground truth of what actually happened):\n${outcomeText}\n\nDRAFT REPLY TO THE USER:\n"""\n${reply}\n"""\n\nOutput PASS if the draft is truthful, otherwise the corrected reply.`;
    try {
        const raw = await chat(GATE_SYSTEM, user);
        const cleaned = raw
            .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
            .replace(/<\/?think(?:ing)?>/gi, "")
            .trim();
        // Treat a short affirmative as "no change".
        if (!cleaned || (/^pass\b/i.test(cleaned) && cleaned.length < 20)) {
            return { reply, corrected: false };
        }
        // Unwrap accidental surrounding quotes/fences.
        const unwrapped = cleaned.replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").replace(/^"""\n?|\n?"""$/g, "").trim();
        // Safety guard: a correction should NEUTRALIZE a false claim, not delete
        // the answer. If the rewrite collapses a substantial reply to a fraction
        // of its length, the model over-rewrote (dropping the real content) —
        // keep the original rather than show the user a gutted answer.
        if (reply.length > 200 && unwrapped.length < reply.length * 0.5) {
            params.log?.("truth-gate rewrite dropped too much; keeping original", { origLen: reply.length, newLen: unwrapped.length });
            return { reply, corrected: false };
        }
        params.log?.("truth-gate corrected a reply", { before: reply.slice(0, 120), after: unwrapped.slice(0, 120) });
        return { reply: unwrapped || reply, corrected: true };
    } catch (err) {
        params.log?.("truth-gate failed; keeping original reply", { err: String(err) });
        return { reply, corrected: false };
    }
}
