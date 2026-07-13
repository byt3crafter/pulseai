/**
 * Tool Policy — allow/deny list filtering for agent tool access.
 * Supports glob patterns: "*", "mcp_*", exact names.
 */

export interface ToolPolicy {
    allow?: string[];
    deny?: string[];
    /** Tools that require human approval before running (hard gate). Glob patterns allowed. */
    ask?: string[];
    /** Tools an operator chose "allow always" for — exempt from the ask gate going forward. */
    alwaysAllow?: string[];
}

/**
 * Whether a tool call must be approved by a human before it runs.
 * Gated when it matches an `ask` pattern and is not in `alwaysAllow`.
 * (deny is handled separately by filterTools — a denied tool never reaches here.)
 */
export function isToolGated(policy: ToolPolicy | null | undefined, toolName: string): boolean {
    if (!policy?.ask?.length) return false;
    if (policy.alwaysAllow?.some((p) => matchesPattern(toolName, p))) return false;
    return policy.ask.some((p) => matchesPattern(toolName, p));
}

/**
 * Glob match with `*` as a wildcard for any run of characters, anywhere in the
 * pattern. Previously only `*`, a trailing `*`, or an exact string worked, so a
 * pattern like `*_send` or `mcp_*_delete` silently matched nothing — a security
 * footgun where an operator believed a tool was gated/denied and it wasn't.
 * Now every `*` position works as expected.
 */
function matchesPattern(name: string, pattern: string): boolean {
    if (pattern === "*") return true;
    if (!pattern.includes("*")) return name === pattern;
    // Escape regex metacharacters, then turn each `*` into `.*`.
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(name);
}

/**
 * Deny-first: if tool matches any deny pattern, it's blocked.
 * Then allow: if allow list is empty/undefined, permit all; otherwise must match.
 */
export function isToolAllowed(policy: ToolPolicy | null | undefined, toolName: string): boolean {
    if (!policy) return true;

    if (policy.deny?.length) {
        for (const pattern of policy.deny) {
            if (matchesPattern(toolName, pattern)) return false;
        }
    }

    if (!policy.allow?.length) return true;

    for (const pattern of policy.allow) {
        if (matchesPattern(toolName, pattern)) return true;
    }

    return false;
}

export function filterTools<T extends { name: string }>(tools: T[], policy: ToolPolicy | null | undefined): T[] {
    if (!policy || (!policy.allow?.length && !policy.deny?.length)) return tools;
    return tools.filter(t => isToolAllowed(policy, t.name));
}
