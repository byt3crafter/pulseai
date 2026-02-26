/**
 * Individual diagnostic checks for the doctor CLI.
 */

export interface CheckResult {
    name: string;
    status: "pass" | "fail" | "warn";
    message: string;
    details?: string;
}

export async function checkDatabase(databaseUrl: string): Promise<CheckResult> {
    try {
        const { default: postgres } = await import("postgres");
        const sql = postgres(databaseUrl, { connect_timeout: 5 });
        const result = await sql`SELECT 1 as ok`;
        await sql.end();
        return { name: "Database", status: "pass", message: "PostgreSQL connection OK" };
    } catch (err: any) {
        return { name: "Database", status: "fail", message: "Cannot connect to PostgreSQL", details: err.message };
    }
}

export async function checkRedis(redisUrl: string | undefined): Promise<CheckResult> {
    if (!redisUrl) {
        return { name: "Redis", status: "warn", message: "REDIS_URL not configured (optional)" };
    }
    try {
        const { Redis } = await import("ioredis");
        const redis = new Redis(redisUrl, { connectTimeout: 5000, lazyConnect: true });
        await redis.connect();
        await redis.ping();
        await redis.disconnect();
        return { name: "Redis", status: "pass", message: "Redis connection OK" };
    } catch (err: any) {
        return { name: "Redis", status: "fail", message: "Cannot connect to Redis", details: err.message };
    }
}

export async function checkDocker(): Promise<CheckResult> {
    try {
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);
        const { stdout } = await execAsync("docker info --format '{{.ServerVersion}}'", { timeout: 5000 });
        return { name: "Docker", status: "pass", message: `Docker ${stdout.trim()} available` };
    } catch {
        return { name: "Docker", status: "warn", message: "Docker not available (sandbox features disabled)" };
    }
}

export async function checkEncryptionKey(key: string | undefined): Promise<CheckResult> {
    if (!key) return { name: "Encryption", status: "fail", message: "ENCRYPTION_KEY not set" };
    if (key.length !== 64) return { name: "Encryption", status: "fail", message: `ENCRYPTION_KEY is ${key.length} chars, expected 64` };
    if (!/^[0-9a-fA-F]+$/.test(key)) return { name: "Encryption", status: "fail", message: "ENCRYPTION_KEY must be hex" };
    return { name: "Encryption", status: "pass", message: "ENCRYPTION_KEY valid (64-char hex)" };
}

export async function checkProviderKeys(databaseUrl: string): Promise<CheckResult> {
    try {
        const { default: postgres } = await import("postgres");
        const sql = postgres(databaseUrl, { connect_timeout: 5 });
        const rows = await sql`SELECT id FROM global_settings WHERE anthropic_api_key_hash IS NOT NULL LIMIT 1`;
        await sql.end();
        if (rows.length > 0) {
            return { name: "Provider Keys", status: "pass", message: "Global Anthropic key configured" };
        }
        return { name: "Provider Keys", status: "warn", message: "No global Anthropic key set" };
    } catch (err: any) {
        return { name: "Provider Keys", status: "fail", message: "Cannot check provider keys", details: err.message };
    }
}

export async function checkWorkspaceDir(dir: string): Promise<CheckResult> {
    try {
        const { access, constants } = await import("fs/promises");
        await access(dir, constants.R_OK | constants.W_OK);
        return { name: "Workspace", status: "pass", message: `Workspace dir ${dir} is writable` };
    } catch {
        return { name: "Workspace", status: "warn", message: `Workspace dir ${dir} not accessible (will be created on first use)` };
    }
}
