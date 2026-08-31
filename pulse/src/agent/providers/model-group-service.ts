/**
 * Resolving a model group into the models to actually use.
 *
 * One place turns (group, strategy, message) into an ORDERED list of model ids
 * to try. The runtime and provider-manager consume that list; the first that
 * answers wins. This replaces two hardcoded things — the model->model fallback
 * map and smart routing's two fixed slots — with configuration.
 *
 * Pure and side-effect free so the strategy logic can be tested exhaustively
 * without a database or a provider.
 *
 * See docs/MODEL_GROUPS_PLAN.md.
 */

import { getModelById } from "./model-registry.js";

export type GroupStrategy = "failover" | "cost" | "both";

export interface ResolvedGroup {
    strategy: GroupStrategy;
    models: string[]; // ordered, validated model ids
}

export interface PickContext {
    /** The user's message, for the cost strategy's simple/complex decision. */
    text: string;
    hasTools: boolean;
    hasAttachments: boolean;
}

/**
 * Order the group's models for THIS turn.
 *
 * The returned list is always a full ordering, not a single pick: the caller
 * tries them in order and the first that answers wins, so failover is free for
 * every strategy. What each strategy decides is which model leads.
 *
 * - failover: the configured order, unchanged. First model leads; the rest are
 *   there for when it errors.
 * - cost: a clearly-simple, tool-free turn leads with the CHEAPEST model;
 *   anything else leads with the most capable. The whole group still trails, so
 *   a wrong cheap guess still falls through rather than failing.
 * - both: same as cost for the lead, and the full group trails for failover.
 */
export function orderModelsForTurn(group: ResolvedGroup, ctx: PickContext): string[] {
    const models = group.models.filter((m) => !!getModelById(m));
    if (models.length <= 1) return models;

    if (group.strategy === "failover") return models;

    // cost / both: decide simple vs complex, then lead with the matching end.
    const simple = isSimpleTurn(ctx);
    if (!simple) {
        // Complex: capable first. Capability is the configured order's FRONT
        // for a cost group (cheap->capable means capable is last), so lead with
        // the last and keep the rest as fallback.
        const capableFirst = [...models].reverse();
        return dedupe(capableFirst);
    }
    // Simple: cheapest (front of a cost-ordered group) leads, capable trails.
    return dedupe(models);
}

/**
 * Is this turn clearly cheap-model material?
 *
 * Deliberately conservative and biased toward "no": sending a turn that needs
 * a tool or real reasoning to a cheap model is the expensive mistake. Tools,
 * attachments, code, URLs, and questions all count as complex. Only short,
 * plain statements are treated as simple.
 */
function isSimpleTurn(ctx: PickContext): boolean {
    const t = (ctx.text || "").trim();
    if (!t) return false;
    if (ctx.hasTools || ctx.hasAttachments) return false;
    if (/```|https?:\/\//i.test(t)) return false;
    if (t.includes("?")) return false;
    // A short, plain statement. Longer or question-shaped turns go capable.
    return t.split(/\s+/).filter(Boolean).length <= 12;
}

function dedupe(xs: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of xs) if (!seen.has(x)) { seen.add(x); out.push(x); }
    return out;
}

/** Normalize a stored group row into a validated ResolvedGroup, or null. */
export function normalizeGroup(row: { strategy?: string; models?: unknown } | null | undefined): ResolvedGroup | null {
    if (!row) return null;
    const models = Array.isArray(row.models) ? (row.models as unknown[]).filter((m): m is string => typeof m === "string") : [];
    if (models.length === 0) return null;
    const strategy: GroupStrategy =
        row.strategy === "cost" || row.strategy === "both" ? row.strategy : "failover";
    return { strategy, models };
}
