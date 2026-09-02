/**
 * Email API — connection testing for the dashboard's "Test connection" button.
 *
 * POST /api/email/test-connection — verify SMTP and/or IMAP login, so a person
 * configuring an agent's mailbox gets an immediate ✅/❌ instead of finding out
 * later through an agent that says "No password configured". Admin-key gated
 * (same as admin-models), reuses the runtime's testConnection().
 *
 * The caller may send either a plaintext `password` (testing values just typed
 * in the editor) or an `encryptedPassword` (testing an already-saved mailbox);
 * we decrypt the latter here where ENCRYPTION_KEY lives.
 */
import { FastifyPluginAsync } from "fastify";
import crypto from "crypto";
import { testConnection } from "../../channels/email/email-service.js";
import { decrypt } from "../../utils/crypto.js";

function resolvePassword(section: any): string {
    if (typeof section?.password === "string" && section.password) return section.password;
    if (typeof section?.encryptedPassword === "string" && section.encryptedPassword) {
        try { return decrypt(section.encryptedPassword); } catch { return ""; }
    }
    return "";
}

export const emailApiRoutes: FastifyPluginAsync = async (fastify) => {
    const adminAuth = async (request: any, reply: any) => {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) return reply.code(401).send({ error: "Authentication required" });
        const token = authHeader.slice(7);
        const adminKey = process.env.ADMIN_API_KEY;
        if (!adminKey) return reply.code(503).send({ error: "Admin API not configured" });
        try {
            const a = Buffer.from(token);
            const b = Buffer.from(adminKey);
            if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
                return reply.code(401).send({ error: "Invalid credentials" });
            }
        } catch { return reply.code(401).send({ error: "Invalid credentials" }); }
    };

    fastify.post("/api/email/test-connection", { preHandler: adminAuth }, async (request, reply) => {
        const body = request.body as { smtp?: any; imap?: any };
        const config: any = {};
        if (body?.smtp?.host) {
            config.smtp = {
                host: String(body.smtp.host),
                port: Number(body.smtp.port) || 587,
                username: String(body.smtp.username || ""),
                password: resolvePassword(body.smtp),
                tls: !!body.smtp.tls,
                fromAddress: String(body.smtp.fromAddress || body.smtp.username || ""),
            };
        }
        if (body?.imap?.host) {
            config.imap = {
                host: String(body.imap.host),
                port: Number(body.imap.port) || 993,
                username: String(body.imap.username || ""),
                password: resolvePassword(body.imap),
                tls: body.imap.tls !== false,
            };
        }
        if (!config.smtp && !config.imap) {
            return reply.send({ smtp: false, imap: false, error: "No SMTP or IMAP host provided." });
        }
        const result = await testConnection(config);
        return reply.send(result);
    });
};
