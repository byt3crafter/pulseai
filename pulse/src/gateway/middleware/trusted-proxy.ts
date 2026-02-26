/**
 * Trusted Proxy Auth Middleware
 * Authenticates requests from trusted reverse proxies by extracting
 * the user identity from a configurable header.
 */

import { FastifyRequest, FastifyReply } from "fastify";
import { config } from "../../config.js";
import { db } from "../../storage/db.js";
import { tenants, users } from "../../storage/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../../utils/logger.js";
import { configManager } from "../../infra/config-manager.js";

// Parse CIDR into { ip, mask } for matching
function parseCIDR(cidr: string): { ip: number; mask: number } | null {
    const parts = cidr.split("/");
    const ip = parts[0];
    const bits = parseInt(parts[1] || "32", 10);

    const octets = ip.split(".").map(Number);
    if (octets.length !== 4 || octets.some(o => isNaN(o) || o < 0 || o > 255)) return null;

    const ipNum = (octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3];
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;

    return { ip: ipNum >>> 0, mask };
}

function ipToNumber(ip: string): number {
    // Strip IPv6 prefix
    if (ip.startsWith("::ffff:")) ip = ip.slice(7);
    const octets = ip.split(".").map(Number);
    if (octets.length !== 4) return 0;
    return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function isIpInCIDR(ip: string, cidr: string): boolean {
    const parsed = parseCIDR(cidr);
    if (!parsed) return false;
    const ipNum = ipToNumber(ip);
    return (ipNum & parsed.mask) === (parsed.ip & parsed.mask);
}

function isIpTrusted(ip: string, trustedIps: string[]): boolean {
    return trustedIps.some(cidr => isIpInCIDR(ip, cidr));
}

/**
 * Extract the real client IP by walking X-Forwarded-For right-to-left,
 * finding the first untrusted hop.
 */
function extractClientIp(request: FastifyRequest, trustedIps: string[]): string {
    const xff = request.headers["x-forwarded-for"];
    if (!xff) return request.ip;

    const ips = (typeof xff === "string" ? xff : xff[0]).split(",").map(s => s.trim());

    // Walk right-to-left
    for (let i = ips.length - 1; i >= 0; i--) {
        if (!isIpTrusted(ips[i], trustedIps)) {
            return ips[i];
        }
    }

    return ips[0] || request.ip;
}

export async function trustedProxyAuth(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const proxyConfig = configManager.get("trusted_proxy") as any;
    if (!proxyConfig?.enabled) return; // Proxy auth not enabled, skip

    const trustedIps = proxyConfig.ips || (config.TRUSTED_PROXY_IPS?.split(",").map((s: string) => s.trim()) || []);
    if (!trustedIps.length) return;

    // Check if request comes from trusted IP
    const sourceIp = request.ip;
    if (!isIpTrusted(sourceIp, trustedIps)) return; // Not from trusted proxy, skip

    // Extract user from header
    const userHeader = proxyConfig.userHeader || config.TRUSTED_PROXY_USER_HEADER || "X-Forwarded-User";
    const proxyUser = request.headers[userHeader.toLowerCase()] as string | undefined;

    if (!proxyUser) return; // No user header, skip

    try {
        // Resolve user to tenant
        const user = await db.query.users.findFirst({
            where: eq(users.email, proxyUser),
        });

        if (user?.tenantId) {
            (request as any).apiTokenContext = {
                tenantId: user.tenantId,
                scopes: ["chat", "responses"],
                tokenId: `proxy-${proxyUser}`,
            };
            logger.debug({ proxyUser, tenantId: user.tenantId }, "Trusted proxy auth resolved");
        }
    } catch (err) {
        logger.error({ err, proxyUser }, "Trusted proxy user resolution failed");
    }
}
