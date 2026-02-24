import pino from "pino";
import { config } from "../config.js";

// Setup pino logger with pretty printing in development, and standard JSON in production
export const logger = pino({
    level: config.LOG_LEVEL,
    ...(config.NODE_ENV === "development"
        ? {
            transport: {
                target: "pino-pretty",
                options: {
                    colorize: true,
                    ignore: "pid,hostname",
                    translateTime: "SYS:standard",
                },
            },
        }
        : {}),
});

/**
 * Creates a child logger tagged with a specific tenant ID.
 * This is crucial for multi-tenant SaaS logging.
 */
export function createTenantLogger(tenantId: string) {
    return logger.child({ tenantId });
}
