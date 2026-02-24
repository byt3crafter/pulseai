import { z } from "zod";
import * as dotenv from "dotenv";

// Load environment variables from .env
dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(3000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url().optional(),
    ANTHROPIC_API_KEY: z.string().min(1, "Anthropic API key is required"),
    OPENAI_API_KEY: z.string().optional(),
    ENCRYPTION_KEY: z.string().length(64, "Encryption key must be a 32-byte hex string (64 characters)"),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
    console.error("❌ Invalid environment variables:", _env.error.format());
    process.exit(1);
}

export const config = _env.data;
