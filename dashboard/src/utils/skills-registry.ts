/**
 * Built-in skill metadata for the dashboard UI.
 * This mirrors the .skill.md files in pulse/src/agent/skills/
 * without requiring the dashboard to read them from disk.
 */

export interface BuiltInSkill {
    name: string;
    description: string;
    category: "core" | "productivity" | "meta";
}

export const BUILTIN_SKILLS: BuiltInSkill[] = [
    {
        name: "memory",
        description: "Store, search, and forget persistent memories",
        category: "core",
    },
    {
        name: "scheduling",
        description: "Create cron jobs and one-time scheduled tasks",
        category: "core",
    },
    {
        name: "workspace",
        description: "Manage workspace configuration files",
        category: "core",
    },
    {
        name: "delegation",
        description: "Delegate tasks to other specialized agents",
        category: "core",
    },
    {
        name: "scripts",
        description: "Save, load, and manage reusable code scripts",
        category: "productivity",
    },
    {
        name: "python",
        description: "Execute Python code in a sandboxed environment",
        category: "productivity",
    },
    {
        name: "formatting",
        description: "Format data and responses for different channels",
        category: "productivity",
    },
    {
        name: "skill-creator",
        description: "Create and manage custom skills",
        category: "meta",
    },
    {
        name: "email",
        description: "Send and read emails via SMTP/IMAP",
        category: "core",
    },
];
