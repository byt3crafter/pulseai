/**
 * Obfuscation detection module.
 * Detects attempts to hide malicious commands via encoding, eval chains,
 * process substitution, and variable expansion tricks.
 */

export interface ObfuscationResult {
    detected: boolean;
    reasons: string[];
    patterns: string[];
}

interface ObfuscationPattern {
    pattern: RegExp;
    name: string;
    description: string;
}

const OBFUSCATION_PATTERNS: ObfuscationPattern[] = [
    // Base64 decode piped to shell
    {
        pattern: /base64\s+(-d|--decode)\s*.*\|\s*(sh|bash|zsh|eval|python|perl|ruby|node)/,
        name: "base64_pipe_shell",
        description: "Base64 decode output piped to shell interpreter",
    },
    // Hex decode piped to shell
    {
        pattern: /xxd\s+(-r|-revert)\s*.*\|\s*(sh|bash|zsh|eval)/,
        name: "hex_pipe_shell",
        description: "Hex decode piped to shell interpreter",
    },
    // eval with encoded input
    {
        pattern: /eval\s+.*(\$\(|`)(.*base64|.*xxd|.*printf|.*echo\s+-e)/,
        name: "eval_decode",
        description: "eval with encoded/decoded input via command substitution",
    },
    // eval with variable expansion
    {
        pattern: /eval\s+"\$\{?\w+\}?"/,
        name: "eval_variable",
        description: "eval executing content from variable",
    },
    // Process substitution with decoding
    {
        pattern: /<\(.*base64\s+-d|<\(.*xxd\s+-r|<\(.*python.*decode/,
        name: "process_sub_decode",
        description: "Process substitution with decode operation",
    },
    // Python/Perl/Ruby -e with encoded exec
    {
        pattern: /(python3?|perl|ruby)\s+-[a-zA-Z]*e\s+.*\b(decode|b64decode|unpack|eval)\b/,
        name: "lang_inline_decode",
        description: "Inline language execution with decode/eval",
    },
    // Python exec/compile with encoded string
    {
        pattern: /python3?\s+-c\s+.*exec\s*\(\s*.*decode/,
        name: "python_exec_decode",
        description: "Python exec with decode pattern",
    },
    // Variable expansion chains (obfuscation via variable building)
    {
        pattern: /\$\{?\w{1,3}\}?\$\{?\w{1,3}\}?\$\{?\w{1,3}\}?\$\{?\w{1,3}\}?.*\|\s*(sh|bash)/,
        name: "var_chain_shell",
        description: "Variable expansion chain piped to shell",
    },
    // printf with octal/hex escapes piped to shell
    {
        pattern: /printf\s+(['"]\\[0-7x]|['"]%b).*\|\s*(sh|bash|eval)/,
        name: "printf_escape_shell",
        description: "printf with escape sequences piped to shell",
    },
    // Openssl enc decode piped to shell
    {
        pattern: /openssl\s+(enc|base64)\s+(-d|--decrypt).*\|\s*(sh|bash)/,
        name: "openssl_decode_shell",
        description: "OpenSSL decode piped to shell",
    },
    // Nested command substitution with decode
    {
        pattern: /\$\(\s*\$\(.*\)\s*\)/,
        name: "nested_cmd_sub",
        description: "Nested command substitution (potential obfuscation)",
    },
    // gzip/gunzip decode piped to shell
    {
        pattern: /(gunzip|gzip\s+-d|zcat)\s*.*\|\s*(sh|bash|eval)/,
        name: "gzip_decode_shell",
        description: "Compressed data piped to shell",
    },
];

/**
 * Detect obfuscation attempts in a command string.
 */
export function detectObfuscation(command: string): ObfuscationResult {
    const matches: ObfuscationPattern[] = OBFUSCATION_PATTERNS.filter((op) =>
        op.pattern.test(command)
    );

    return {
        detected: matches.length > 0,
        reasons: matches.map((m) => m.description),
        patterns: matches.map((m) => m.name),
    };
}
