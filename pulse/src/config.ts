import { z } from "zod";
import * as dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url().optional().refine(
        (val) => {
            if (process.env.NODE_ENV === "production" && !val) {
                return false;
            }
            return true;
        },
        {
            message: "REDIS_URL is required in production mode",
        }
    ),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().optional(),
    ENCRYPTION_KEY: z.string().length(64, "Encryption key must be a 32-byte hex string (64 characters)"),
    WEBHOOK_BASE_URL: z.string().url().optional(), // e.g., https://pulse.runstate.mu
    DASHBOARD_URL: z.string().url().optional(), // e.g., http://localhost:3001
    TELEGRAM_WEBHOOK_SECRET: z.string().optional(), // For webhook validation
    WORKSPACE_BASE_DIR: z.string().default("../data/workspaces"),
    GATEWAY_WS_ENABLED: z.coerce.boolean().default(false),
    TRUSTED_PROXY_IPS: z.string().optional(), // Comma-separated CIDR list
    TRUSTED_PROXY_USER_HEADER: z.string().default("X-Forwarded-User"),
    BONJOUR_ENABLED: z.coerce.boolean().default(false),
    PYTHON_SANDBOX_IMAGE: z.string().default("pulse-python-sandbox:latest"),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
    console.error("❌ Invalid environment variables:", _env.error.format());
    process.exit(1);
}

export const config = _env.data;
