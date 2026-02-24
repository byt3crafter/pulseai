import rateLimit from "@fastify/rate-limit";
import { config } from "../../config.js";

/**
 * Rate Limiting Configuration
 *
 * Protects the API from abuse by limiting requests per IP/tenant
 * Uses Redis for distributed rate limiting in production
 */
export const rateLimitConfig = {
    // Global rate limit
    global: true,

    // Maximum requests per time window
    max: 100,

    // Time window (1 minute)
    timeWindow: "1 minute",

    // Use Redis if available for distributed rate limiting
    redis: config.REDIS_URL
        ? (() => {
              const url = new URL(config.REDIS_URL);
              return {
                  host: url.hostname,
                  port: parseInt(url.port || "6379"),
                  password: url.password || undefined,
              };
          })()
        : undefined,

    // Key generator - rate limit by tenant slug or IP
    keyGenerator: (request: any) => {
        // Try to extract tenant slug from URL params
        const tenantSlug = request.params?.tenantSlug;
        if (tenantSlug) {
            return `tenant:${tenantSlug}`;
        }

        // Try to extract from headers (for API endpoints)
        const tenantHeader = request.headers["x-tenant-slug"];
        if (tenantHeader) {
            return `tenant:${tenantHeader}`;
        }

        // Fallback to IP-based rate limiting
        return `ip:${request.ip}`;
    },

    // Custom error response
    errorResponseBuilder: (request: any, context: any) => {
        return {
            statusCode: 429,
            error: "Too Many Requests",
            message: "Rate limit exceeded. Please try again later.",
            retryAfter: context.after,
        };
    },

    // Skip rate limiting for health check
    skip: (request: any) => {
        return request.url === "/health";
    },

    // Add rate limit headers to response
    addHeaders: {
        "x-ratelimit-limit": true,
        "x-ratelimit-remaining": true,
        "x-ratelimit-reset": true,
        "retry-after": true,
    },
};

/**
 * Create rate limit plugin with configuration
 */
export const rateLimitPlugin = rateLimit;
