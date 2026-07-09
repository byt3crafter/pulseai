/**
 * SSH execution engine for the Server Inventory feature.
 *
 * Pure-JS SSH client (ssh2) — no native compile step required, works on
 * Alpine. One connection per call: connect, exec, collect output, always
 * disconnect. Never logs the decrypted secret (private key / password).
 */
import { Client, type ConnectConfig } from "ssh2";
import { logger } from "../utils/logger.js";

export const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
export const DEFAULT_EXEC_TIMEOUT_SECONDS = 30;
export const MAX_EXEC_TIMEOUT_SECONDS = 120;
export const MAX_OUTPUT_BYTES = 100 * 1024; // 100KB cap per stream

export interface SshTarget {
    host: string;
    port: number;
    username: string;
    authType: "key" | "password";
    /** Decrypted secret — a private key (PEM) for authType "key", or a plaintext password. */
    secret: string;
    /** Optional passphrase for an encrypted private key. */
    passphrase?: string;
}

export interface SshExecResult {
    exitCode: number | null;
    signal: string | null;
    stdout: string;
    stderr: string;
    durationMs: number;
    timedOut: boolean;
}

function capOutput(chunks: Buffer[], maxBytes: number): { text: string; truncated: boolean } {
    const buf = Buffer.concat(chunks);
    if (buf.length <= maxBytes) return { text: buf.toString("utf8"), truncated: false };
    return { text: buf.subarray(0, maxBytes).toString("utf8"), truncated: true };
}

/**
 * Open an SSH connection, run a single command, capture output, and always
 * close the connection — regardless of success, error, or timeout.
 */
export function sshExec(
    target: SshTarget,
    command: string,
    opts: { timeoutSeconds?: number; connectTimeoutMs?: number } = {}
): Promise<SshExecResult> {
    const timeoutSeconds = Math.min(
        Math.max(1, opts.timeoutSeconds ?? DEFAULT_EXEC_TIMEOUT_SECONDS),
        MAX_EXEC_TIMEOUT_SECONDS
    );
    const connectTimeoutMs = opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
        const conn = new Client();
        const start = Date.now();
        let settled = false;
        let execTimer: NodeJS.Timeout | undefined;

        const cleanup = () => {
            if (execTimer) clearTimeout(execTimer);
            try {
                conn.end();
            } catch {
                /* already closed */
            }
        };

        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            cleanup();
            fn();
        };

        const connConfig: ConnectConfig = {
            host: target.host,
            port: target.port,
            username: target.username,
            readyTimeout: connectTimeoutMs,
            // Don't retry auth methods forever — one shot.
            tryKeyboard: false,
        };
        if (target.authType === "key") {
            connConfig.privateKey = target.secret;
            if (target.passphrase) connConfig.passphrase = target.passphrase;
        } else {
            connConfig.password = target.secret;
        }

        conn
            .on("ready", () => {
                conn.exec(command, (err, stream) => {
                    if (err) {
                        finish(() => reject(new Error("Failed to start remote command")));
                        return;
                    }

                    const stdoutChunks: Buffer[] = [];
                    const stderrChunks: Buffer[] = [];
                    let stdoutBytes = 0;
                    let stderrBytes = 0;
                    let exitCode: number | null = null;
                    let signal: string | null = null;

                    execTimer = setTimeout(() => {
                        finish(() =>
                            resolve({
                                exitCode: null,
                                signal: null,
                                stdout: capOutput(stdoutChunks, MAX_OUTPUT_BYTES).text,
                                stderr: capOutput(stderrChunks, MAX_OUTPUT_BYTES).text,
                                durationMs: Date.now() - start,
                                timedOut: true,
                            })
                        );
                    }, timeoutSeconds * 1000);

                    stream.on("data", (chunk: Buffer) => {
                        if (stdoutBytes < MAX_OUTPUT_BYTES) {
                            stdoutChunks.push(chunk);
                            stdoutBytes += chunk.length;
                        }
                    });
                    stream.stderr?.on("data", (chunk: Buffer) => {
                        if (stderrBytes < MAX_OUTPUT_BYTES) {
                            stderrChunks.push(chunk);
                            stderrBytes += chunk.length;
                        }
                    });
                    stream.on("close", (code: number | null, sig: string | null) => {
                        exitCode = code;
                        signal = sig;
                        finish(() =>
                            resolve({
                                exitCode,
                                signal,
                                stdout: capOutput(stdoutChunks, MAX_OUTPUT_BYTES).text,
                                stderr: capOutput(stderrChunks, MAX_OUTPUT_BYTES).text,
                                durationMs: Date.now() - start,
                                timedOut: false,
                            })
                        );
                    });
                    stream.on("error", () => {
                        finish(() => reject(new Error("Remote command stream error")));
                    });
                });
            })
            .on("error", (err) => {
                logger.warn({ host: target.host, port: target.port, errName: err?.name }, "SSH connection failed");
                finish(() => reject(new Error("Could not connect to the server — check host, port, and credentials")));
            })
            .on("timeout", () => {
                finish(() => reject(new Error("Connection to the server timed out")));
            })
            .connect(connConfig);
    });
}

/** Quick reachability + auth check used by the dashboard's "Test connection" button. */
export async function testSshConnection(
    target: SshTarget
): Promise<{ ok: true; latencyMs: number; output: string } | { ok: false; message: string }> {
    const start = Date.now();
    try {
        const result = await sshExec(target, "uptime", { timeoutSeconds: 10 });
        const latencyMs = Date.now() - start;
        if (result.timedOut) return { ok: false, message: "Command timed out." };
        if (result.exitCode !== 0) {
            return { ok: false, message: (result.stderr || result.stdout || "Command failed").slice(0, 300) };
        }
        return { ok: true, latencyMs, output: result.stdout.trim().slice(0, 300) };
    } catch (err: any) {
        return { ok: false, message: err?.message || "Connection failed." };
    }
}
