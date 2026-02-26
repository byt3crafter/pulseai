/**
 * Dangerous command patterns blacklist.
 * Each pattern includes a regex, description, and severity level.
 */

export interface DangerousPattern {
    pattern: RegExp;
    description: string;
    severity: "critical" | "high" | "medium";
}

export const DANGEROUS_PATTERNS: DangerousPattern[] = [
    // Critical: Destructive filesystem operations
    {
        pattern: /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(-[a-zA-Z]*r[a-zA-Z]*\s+)?\//,
        description: "Recursive delete from root",
        severity: "critical",
    },
    {
        pattern: /rm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)?(-[a-zA-Z]*f[a-zA-Z]*\s+)?~\//,
        description: "Recursive delete of home directory",
        severity: "critical",
    },
    {
        pattern: /rm\s+-[a-zA-Z]*rf?\s+\.\s/,
        description: "Recursive delete of current directory",
        severity: "critical",
    },
    // Critical: Database destruction
    {
        pattern: /DROP\s+(TABLE|DATABASE)\s/i,
        description: "SQL DROP TABLE/DATABASE",
        severity: "critical",
    },
    {
        pattern: /TRUNCATE\s+(TABLE\s+)?\w/i,
        description: "SQL TRUNCATE",
        severity: "critical",
    },
    // Critical: Remote code execution via pipe
    {
        pattern: /curl\s+.*\|\s*(sh|bash|zsh|python|perl|ruby)/,
        description: "curl piped to shell interpreter",
        severity: "critical",
    },
    {
        pattern: /wget\s+.*\|\s*(sh|bash|zsh|python|perl|ruby)/,
        description: "wget piped to shell interpreter",
        severity: "critical",
    },
    {
        pattern: /curl\s+.*>\s*\/tmp\/.*&&\s*(sh|bash|chmod)/,
        description: "curl download and execute pattern",
        severity: "critical",
    },
    // Critical: Encoded execution
    {
        pattern: /eval\s+.*(\$\(|`)\s*base64\s+-d/,
        description: "eval with base64 decode",
        severity: "critical",
    },
    // High: Dangerous permission changes
    {
        pattern: /chmod\s+777\s/,
        description: "chmod 777 (world-writable)",
        severity: "high",
    },
    {
        pattern: /chown\s+root\s/,
        description: "chown to root",
        severity: "high",
    },
    // Critical: Disk destruction
    {
        pattern: /mkfs\s/,
        description: "Filesystem creation (mkfs)",
        severity: "critical",
    },
    {
        pattern: /dd\s+if=/,
        description: "Raw disk write (dd)",
        severity: "critical",
    },
    // Critical: Fork bomb
    {
        pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;?\s*:/,
        description: "Fork bomb",
        severity: "critical",
    },
    // High: Reverse shells
    {
        pattern: /\/dev\/(tcp|udp)\//,
        description: "Reverse shell via /dev/tcp",
        severity: "high",
    },
    {
        pattern: /nc\s+(-[a-zA-Z]*e\s+|.*-e\s+)(\/bin\/(sh|bash)|sh|bash)/,
        description: "Netcat reverse shell",
        severity: "high",
    },
    // High: Privilege escalation
    {
        pattern: /sudo\s+/,
        description: "sudo usage (privilege escalation)",
        severity: "high",
    },
    // Medium: Potentially dangerous network exfil
    {
        pattern: /curl\s+.*-d\s+@\//,
        description: "curl posting local file contents",
        severity: "medium",
    },
];

/**
 * Check a command against all dangerous patterns.
 * Returns all matching patterns (not just the first).
 */
export function checkDangerousPatterns(command: string): DangerousPattern[] {
    return DANGEROUS_PATTERNS.filter((dp) => dp.pattern.test(command));
}
