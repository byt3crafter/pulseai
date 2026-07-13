/**
 * Command policy engine for the Server Inventory feature.
 *
 * Pure functions — no I/O, no DB, no SSH — so they're cheap to unit test
 * exhaustively (see ../__tests__/command-policy.test.ts). This is the ONE
 * place that decides whether a command an agent wants to run over SSH is
 * allowed for a given server's `safetyMode`:
 *
 *   - "observe": allowlist by first token (read-only diagnostics) AND no
 *     shell metacharacters — a single simple command, nothing chained.
 *   - "safe":    blocklist of destructive patterns; everything else passes.
 *     The blocklist is matched against the WHOLE command string (not split
 *     on ; && |), so a destructive command hidden behind a chain is still
 *     caught — e.g. "echo hi && rm -rf /" still matches the rm-root pattern.
 *   - "full":    no restrictions — the server owner has explicitly opted in.
 */

export type SafetyMode = "observe" | "safe" | "full";

export interface PolicyResult {
    allowed: boolean;
    reason?: string;
}

// ─── Observe mode ───────────────────────────────────────────────────────────

/**
 * Shell metacharacters that would let a command chain, redirect, or substitute.
 * Newline and carriage return are included: `command.split(/\s+/)` collapses
 * them, so without this a payload like `df\nrm -rf /` would pass the token
 * check and then run both lines in the remote shell.
 */
const SHELL_METACHAR_RE = /[;&|<>`\n\r]|\$\(/;

/**
 * `find` primaries that execute commands, delete files, or write to disk.
 * `find` is otherwise a read-only diagnostic, but `-exec`/`-delete`/etc. turn
 * it into arbitrary command execution (e.g. `find / -exec rm -rf {} +`), so an
 * observe-mode `find` carrying any of these is rejected.
 */
const FIND_ACTION_RE = /(^|\s)-(exec|execdir|ok|okdir|delete|fprint|fprintf|fprint0|fls)\b/;

/** Binaries allowed in observe mode with no special-casing — read-only diagnostics. */
const OBSERVE_ALLOWLIST = new Set([
    "df", "du", "free", "uptime", "uname", "whoami", "id", "ps", "top",
    "ls", "cat", "tail", "head", "grep", "find", "stat", "journalctl",
    "ss", "netstat", "ip", "ping",
]);

function baseBinary(token: string): string {
    return token.split("/").pop() || token;
}

function checkObserve(command: string): PolicyResult {
    if (SHELL_METACHAR_RE.test(command)) {
        return {
            allowed: false,
            reason: "Observe mode only allows a single simple command — shell operators (; & | > < ` $()) are blocked.",
        };
    }

    const tokens = command.split(/\s+/).filter(Boolean);
    const bin = baseBinary(tokens[0] || "");

    if (bin === "systemctl") {
        if (tokens[1] !== "status") {
            return {
                allowed: false,
                reason: "Observe mode only allows 'systemctl status' — not start/stop/restart/enable/disable/mask.",
            };
        }
        return { allowed: true };
    }

    if (bin === "docker") {
        const sub = tokens[1];
        if (!sub || !["ps", "logs", "stats", "inspect"].includes(sub)) {
            return {
                allowed: false,
                reason: "Observe mode only allows 'docker ps/logs/stats/inspect' — not run/exec/rm/stop.",
            };
        }
        return { allowed: true };
    }

    if (bin === "find") {
        if (FIND_ACTION_RE.test(command)) {
            return {
                allowed: false,
                reason: "Observe mode allows 'find' for searching only — action primaries (-exec, -delete, -ok, -fprint, …) are blocked.",
            };
        }
        return { allowed: true };
    }

    if (bin === "curl") {
        // -F/--form and --upload-file imply a POST/upload; -d/--data* send a body;
        // -o/-O/-T/-X write files or use write verbs. Any of these makes curl a
        // write/exfiltration tool, not a read-only fetch.
        if (/(^|\s)(-o\b|-O\b|--output\b|-T\b|--upload-file\b|-d\b|--data\b|--data-\S+|-F\b|--form\b|-X\s*(POST|PUT|DELETE|PATCH)|--request\s*(POST|PUT|DELETE|PATCH)|--post\S*)/i.test(command)) {
            return {
                allowed: false,
                reason: "Observe mode only allows read-only fetches — no writing files, uploads, form posts, or POST/PUT/DELETE.",
            };
        }
        return { allowed: true };
    }

    if (OBSERVE_ALLOWLIST.has(bin)) return { allowed: true };

    return {
        allowed: false,
        reason: `'${bin || command}' is not in the observe-mode allowlist (read-only diagnostics only: ${[...OBSERVE_ALLOWLIST].join(", ")}, systemctl status, docker ps/logs/stats/inspect, curl).`,
    };
}

// ─── Safe mode ──────────────────────────────────────────────────────────────

interface BlockRule {
    pattern: RegExp;
    reason: string;
}

/**
 * Destructive-command blocklist for "safe" mode. Matched against the whole
 * command string, so chaining (; && |) does not hide a destructive segment.
 */
const SAFE_BLOCKLIST: BlockRule[] = [
    // Recursive delete of the root filesystem, including the `//` and `/*`
    // variants that defeated the previous `\/(\s|$)` anchor. Any flag(s) may
    // precede or sit between the recursive flag and the target; the target is
    // one-or-more slashes optionally followed by `*` or end/space.
    { pattern: /\brm\s+(?:-\S+\s+)*-\S*r\S*\s+(?:-\S+\s+)*\/+(\*|\s|$)/i, reason: "Recursive delete of the root filesystem (rm -rf /, //, /*)." },
    // Recursive delete of a top-level system directory ITSELF (e.g. rm -rf /etc,
    // /usr). Deeper paths (/home/app/cache, /var/tmp/x) are allowed — safe mode
    // guards against wiping a whole system tree, not every nested delete.
    { pattern: /\brm\s+(?:-\S+\s+)*-\S*r\S*\s+(?:-\S+\s+)*\/(etc|usr|var|bin|sbin|lib|lib64|boot|root|home|sys|proc|dev|opt|run|srv|mnt|lost\+found)\/?(\s|$)/i, reason: "Recursive delete of a system directory is blocked in safe mode." },
    // Recursive/forced delete of the home directory (unqualified).
    { pattern: /\brm\s+(?:-\S+\s+)*-\S*r\S*\s+(?:-\S+\s+)*~\/?(\s|$)/i, reason: "Recursive/forced delete of the home directory." },
    // Recursive delete with a bare wildcard (unqualified target).
    { pattern: /\brm\s+(?:-\S+\s+)*-\S*r\S*\s+(?:-\S+\s+)*\*(\s|$)/i, reason: "Recursive delete with a wildcard target (unqualified)." },
    // rm -rf with no target at all.
    { pattern: /\brm\s+(?:-\S+\s+)*-\S*r\S*\s*$/i, reason: "Recursive delete with no target (unqualified)." },
    // Recursive delete of current or parent directory.
    { pattern: /\brm\s+(?:-\S+\s+)*-\S*r\S*\s+(?:-\S+\s+)*\.\.?(\s|$)/i, reason: "Recursive delete of the current/parent directory (unqualified)." },
    // Filesystem creation — destroys existing data on the target device.
    { pattern: /\bmkfs(\.\w+)?\s/, reason: "Filesystem creation (mkfs) destroys data on the target device." },
    // Raw disk overwrite.
    { pattern: /\bdd\s+.*\bof=\/dev\/[a-z]/i, reason: "Raw write to a block device via dd." },
    { pattern: />\s*\/dev\/sd[a-z]?\d*\b/, reason: "Shell redirect writing directly to a raw disk device." },
    { pattern: /\bwipefs\b/, reason: "wipefs erases filesystem signatures on a device." },
    // Partitioning tools — treat any invocation as destructive in safe mode.
    { pattern: /\b(fdisk|parted|sfdisk|gdisk)\b/, reason: "Disk partitioning tools are blocked in safe mode." },
    // Power state changes.
    { pattern: /\b(shutdown|reboot|halt|poweroff)\b/, reason: "Command would shut down or reboot the server." },
    { pattern: /\binit\s+[06]\b/, reason: "Command would shut down or reboot the server (init 0/6)." },
    // systemctl mask is close to irreversible without manual intervention; stop/disable/start/enable are allowed.
    { pattern: /\bsystemctl\s+mask\b/, reason: "systemctl mask is blocked in safe mode (stop/disable are allowed)." },
    // Account destruction / lockout.
    { pattern: /\b(userdel|groupdel)\b/, reason: "Deleting user/group accounts is blocked in safe mode." },
    { pattern: /\bpasswd\b/, reason: "Changing account passwords is blocked in safe mode." },
    // Recursive permission changes on root.
    { pattern: /\bchmod\s+-[a-zA-Z]*R[a-zA-Z]*\s+\S+\s+\/(\s|$)/, reason: "Recursive chmod on the root filesystem." },
    { pattern: /\bchown\s+-[a-zA-Z]*R[a-zA-Z]*\s+\S+\s+\/(\s|$)/, reason: "Recursive chown on the root filesystem." },
    // Fork bomb.
    { pattern: /:\(\)\s*\{\s*:\|:&\s*\}\s*;?\s*:/, reason: "Fork bomb." },
    // Firewall disabling.
    { pattern: /\biptables\s+(-F|--flush)\b/, reason: "Flushing all iptables rules is blocked in safe mode." },
    { pattern: /\bufw\s+disable\b/, reason: "Disabling the firewall (ufw disable) is blocked in safe mode." },
    // Database destruction.
    { pattern: /\bDROP\s+(TABLE|DATABASE)\b/i, reason: "SQL DROP TABLE/DATABASE is blocked in safe mode." },
    { pattern: /\bTRUNCATE\b/i, reason: "SQL TRUNCATE is blocked in safe mode." },
    // Covering tracks.
    { pattern: /\bhistory\s+-c\b/, reason: "Clearing shell history is blocked in safe mode." },
    { pattern: /\bcrontab\s+-r\b/, reason: "Removing all cron jobs (crontab -r) is blocked in safe mode." },
];

function checkSafe(command: string): PolicyResult {
    for (const rule of SAFE_BLOCKLIST) {
        if (rule.pattern.test(command)) return { allowed: false, reason: rule.reason };
    }
    return { allowed: true };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Decide whether `command` may run on a server whose safety mode is `mode`.
 * Pure — callers are responsible for logging the decision.
 */
export function checkCommandPolicy(command: string, mode: SafetyMode): PolicyResult {
    const trimmed = (command || "").trim();
    if (!trimmed) return { allowed: false, reason: "Empty command." };

    if (mode === "full") return { allowed: true };
    if (mode === "observe") return checkObserve(trimmed);
    return checkSafe(trimmed);
}

/**
 * Classify whether `command` is read-only, by reusing the "observe" mode
 * allowlist as the read-only definition. Used by the server-approval workflow
 * to decide whether a command needs approval under `approval_mode = 'writes'`
 * (only non-read-only commands do) — independent of the server's actual
 * `safetyMode`, which may be more permissive (e.g. 'safe' or 'full').
 */
export function isReadOnlyCommand(command: string): boolean {
    const trimmed = (command || "").trim();
    if (!trimmed) return false;
    return checkObserve(trimmed).allowed;
}
