/**
 * Safe command whitelist with per-binary profiles.
 * Commands in this list are allowed by default unless overridden by policy rules.
 */

export interface BinaryProfile {
    maxArgs: number;
    deniedFlags: string[];
    description: string;
}

export const SAFE_BINARIES: Record<string, BinaryProfile> = {
    // Read-only system tools
    ls: { maxArgs: 10, deniedFlags: [], description: "List directory contents" },
    cat: { maxArgs: 5, deniedFlags: [], description: "Concatenate and display files" },
    head: { maxArgs: 3, deniedFlags: [], description: "Display first lines of file" },
    tail: { maxArgs: 3, deniedFlags: [], description: "Display last lines of file" },
    grep: { maxArgs: 10, deniedFlags: [], description: "Search text patterns" },
    wc: { maxArgs: 5, deniedFlags: [], description: "Word/line/byte count" },
    sort: { maxArgs: 5, deniedFlags: [], description: "Sort lines" },
    uniq: { maxArgs: 3, deniedFlags: [], description: "Remove duplicate lines" },
    cut: { maxArgs: 5, deniedFlags: [], description: "Remove sections from lines" },
    jq: { maxArgs: 5, deniedFlags: [], description: "JSON processor" },
    find: { maxArgs: 10, deniedFlags: ["-exec", "-execdir", "-delete"], description: "Find files" },
    file: { maxArgs: 5, deniedFlags: [], description: "Determine file type" },
    stat: { maxArgs: 5, deniedFlags: [], description: "File status" },
    du: { maxArgs: 5, deniedFlags: [], description: "Disk usage" },
    df: { maxArgs: 3, deniedFlags: [], description: "Disk free space" },
    pwd: { maxArgs: 0, deniedFlags: [], description: "Print working directory" },
    whoami: { maxArgs: 0, deniedFlags: [], description: "Print current user" },
    date: { maxArgs: 3, deniedFlags: [], description: "Display date/time" },
    echo: { maxArgs: 20, deniedFlags: [], description: "Print text" },
    printf: { maxArgs: 20, deniedFlags: [], description: "Formatted output" },
    basename: { maxArgs: 3, deniedFlags: [], description: "Strip directory from filename" },
    dirname: { maxArgs: 3, deniedFlags: [], description: "Strip filename from path" },
    env: { maxArgs: 5, deniedFlags: [], description: "Print environment" },
    tr: { maxArgs: 5, deniedFlags: [], description: "Translate characters" },
    sed: { maxArgs: 10, deniedFlags: [], description: "Stream editor" },
    awk: { maxArgs: 10, deniedFlags: [], description: "Pattern scanning" },
    tee: { maxArgs: 5, deniedFlags: [], description: "Redirect output" },
    diff: { maxArgs: 5, deniedFlags: [], description: "Compare files" },
    md5sum: { maxArgs: 5, deniedFlags: [], description: "MD5 checksum" },
    sha256sum: { maxArgs: 5, deniedFlags: [], description: "SHA-256 checksum" },
    base64: { maxArgs: 3, deniedFlags: [], description: "Base64 encode/decode" },
    // Programming languages (safe in sandbox context)
    python3: { maxArgs: 20, deniedFlags: [], description: "Python 3 interpreter" },
    python: { maxArgs: 20, deniedFlags: [], description: "Python interpreter" },
    pip: { maxArgs: 10, deniedFlags: [], description: "Python package installer" },
    pip3: { maxArgs: 10, deniedFlags: [], description: "Python 3 package installer" },
    node: { maxArgs: 10, deniedFlags: [], description: "Node.js runtime" },
    npm: { maxArgs: 10, deniedFlags: [], description: "Node package manager" },
    npx: { maxArgs: 10, deniedFlags: [], description: "Node package executor" },
    // Network tools (read-only)
    curl: { maxArgs: 20, deniedFlags: [], description: "Transfer data from URLs" },
    wget: { maxArgs: 10, deniedFlags: [], description: "Download files" },
    ping: { maxArgs: 5, deniedFlags: [], description: "Network ping" },
    dig: { maxArgs: 5, deniedFlags: [], description: "DNS lookup" },
    nslookup: { maxArgs: 3, deniedFlags: [], description: "DNS query" },
    host: { maxArgs: 3, deniedFlags: [], description: "DNS lookup" },
    // File manipulation (controlled)
    mkdir: { maxArgs: 5, deniedFlags: [], description: "Create directories" },
    touch: { maxArgs: 5, deniedFlags: [], description: "Create empty files" },
    cp: { maxArgs: 10, deniedFlags: [], description: "Copy files" },
    mv: { maxArgs: 10, deniedFlags: [], description: "Move/rename files" },
};

/**
 * Extract the base binary name from a command string.
 * Handles paths like /usr/bin/python3 → python3
 */
export function extractBinary(command: string): string | null {
    const trimmed = command.trim();
    // Handle env prefix: env VAR=val binary ...
    const envMatch = trimmed.match(/^env\s+(\w+=\S+\s+)*(\S+)/);
    if (envMatch) return envMatch[2].split("/").pop() || null;

    const firstToken = trimmed.split(/\s+/)[0];
    if (!firstToken) return null;
    return firstToken.split("/").pop() || null;
}

/**
 * Check if a command's binary is in the safe list.
 * Returns the profile if safe, null otherwise.
 */
export function checkSafeCommand(command: string): { binary: string; profile: BinaryProfile } | null {
    const binary = extractBinary(command);
    if (!binary) return null;

    const profile = SAFE_BINARIES[binary];
    if (!profile) return null;

    // Check for denied flags
    for (const flag of profile.deniedFlags) {
        if (command.includes(flag)) return null;
    }

    return { binary, profile };
}
