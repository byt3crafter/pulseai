/**
 * Minimal SSH connection test used by the "Test connection" button on
 * /dashboard/servers. The dashboard and the pulse gateway are separate
 * deployables (no shared runtime import), so this is a small, self-contained
 * mirror of pulse/src/servers/ssh-exec.ts scoped to exactly what the button
 * needs: connect, run `uptime`, report latency or the real error. It is NOT
 * used to execute arbitrary commands — that only ever happens inside the
 * pulse gateway's policy-gated server_exec tool.
 */
import { Client, type ConnectConfig } from "ssh2";

const CONNECT_TIMEOUT_MS = 10_000;
const COMMAND_TIMEOUT_MS = 10_000;

export interface SshTestTarget {
    host: string;
    port: number;
    username: string;
    authType: "key" | "password";
    /** Decrypted secret — a private key (PEM) for "key", or a plaintext password. */
    secret: string;
}

export type SshTestResult = { ok: true; latencyMs: number; output: string } | { ok: false; message: string };

export function testSshConnection(target: SshTestTarget): Promise<SshTestResult> {
    const start = Date.now();
    return new Promise((resolve) => {
        const conn = new Client();
        let settled = false;
        let timer: NodeJS.Timeout | undefined;

        const finish = (result: SshTestResult) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            try {
                conn.end();
            } catch {
                /* already closed */
            }
            resolve(result);
        };

        const connConfig: ConnectConfig = {
            host: target.host,
            port: target.port,
            username: target.username,
            readyTimeout: CONNECT_TIMEOUT_MS,
            tryKeyboard: false,
        };
        if (target.authType === "key") {
            connConfig.privateKey = target.secret;
        } else {
            connConfig.password = target.secret;
        }

        conn
            .on("ready", () => {
                conn.exec("uptime", (err, stream) => {
                    if (err) {
                        finish({ ok: false, message: "Connected, but could not start a remote command." });
                        return;
                    }
                    const chunks: Buffer[] = [];
                    const errChunks: Buffer[] = [];

                    timer = setTimeout(() => {
                        finish({ ok: false, message: "Connected, but the test command timed out." });
                    }, COMMAND_TIMEOUT_MS);

                    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
                    stream.stderr?.on("data", (chunk: Buffer) => errChunks.push(chunk));
                    stream.on("close", (code: number | null) => {
                        const latencyMs = Date.now() - start;
                        if (code !== 0) {
                            const message = Buffer.concat(errChunks).toString("utf8").trim() || `Command exited with code ${code}.`;
                            finish({ ok: false, message: message.slice(0, 300) });
                            return;
                        }
                        finish({ ok: true, latencyMs, output: Buffer.concat(chunks).toString("utf8").trim().slice(0, 300) });
                    });
                });
            })
            .on("error", (err) => {
                finish({ ok: false, message: err?.message || "Could not connect — check host, port, and credentials." });
            })
            .on("timeout", () => {
                finish({ ok: false, message: "Connection to the server timed out." });
            })
            .connect(connConfig);
    });
}
