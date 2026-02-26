/**
 * Tool Policy — allow/deny list filtering for agent tool access.
 * Supports glob patterns: "*", "mcp_*", exact names.
 */

export interface ToolPolicy {
    allow?: string[];
    deny?: string[];
}

function matchesPattern(name: string, pattern: string): boolean {
    if (pattern === "*") return true;
    if (pattern.endsWith("*")) {
        return name.startsWith(pattern.slice(0, -1));
    }
    return name === pattern;
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
