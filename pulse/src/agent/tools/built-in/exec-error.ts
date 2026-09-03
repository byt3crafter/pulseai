/**
 * Reduce a child_process error to fields that are safe to log and to hand back
 * to the model. `err.message` and `err.cmd` embed the full command line — for
 * the sandboxes that is `docker run -e KEY=VALUE …`, i.e. every injected vault
 * secret in plaintext — so they are dropped, and any `KEY=VALUE` that slipped
 * into stderr is masked as well.
 */
export interface SafeExecError {
    code: number | string | null;
    signal: string | null;
    killed: boolean;
    stderr: string;
}

const SECRET_ENV = /\b([A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASS|PWD|CREDENTIAL|AUTH)[A-Z0-9_]*)=(\S+)/g;

export function maskSecrets(text: string): string {
    return text.replace(SECRET_ENV, "$1=***");
}

export function sanitizeExecError(err: any, maxStderr = 4000): SafeExecError {
    const stderr = typeof err?.stderr === "string" ? err.stderr : "";
    return {
        code: err?.code ?? null,
        signal: err?.signal ?? null,
        killed: !!err?.killed,
        stderr: maskSecrets(stderr).slice(-maxStderr),
    };
}
