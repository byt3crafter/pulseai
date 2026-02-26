/**
 * Credential Vault — securely store, retrieve, and inject API credentials
 * for agent use. Credentials are AES-256-GCM encrypted at rest.
 *
 * Reuses the same encrypt/decrypt pattern from provider-key-service.
 */

import { db } from "../../storage/db.js";
import { credentials } from "../../storage/schema.js";
import { encrypt, decrypt } from "../../utils/crypto.js";
import { eq, and, or, isNull } from "drizzle-orm";
import { logger } from "../../utils/logger.js";

export interface CredentialInfo {
    id: string;
    name: string;
    type: string;
    description: string | null;
    agentId: string | null;
    metadata: Record<string, any>;
    updatedAt: Date | null;
}

export class CredentialVault {
    /**
     * Store a credential (encrypts value before DB insert).
     * Upserts by (tenantId, name).
     */
    async store(
        tenantId: string,
        name: string,
        value: string,
        opts?: {
            agentId?: string;
            type?: string;
            description?: string;
            metadata?: Record<string, any>;
        }
    ): Promise<void> {
        const encryptedValue = encrypt(value);
        const normalized = name.toUpperCase().replace(/[^A-Z0-9_]/g, "_");

        await db
            .insert(credentials)
            .values({
                tenantId,
                name: normalized,
                encryptedValue,
                agentId: opts?.agentId || null,
                credentialType: opts?.type || "api_key",
                description: opts?.description || null,
                metadata: opts?.metadata || {},
                updatedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: [credentials.tenantId, credentials.name],
                set: {
                    encryptedValue,
                    agentId: opts?.agentId || null,
                    credentialType: opts?.type || "api_key",
                    description: opts?.description || null,
                    metadata: opts?.metadata || {},
                    updatedAt: new Date(),
                },
            });

        logger.info({ tenantId, name: normalized }, "Credential stored");
    }

    /**
     * Retrieve a credential (decrypts from DB).
     */
    async retrieve(tenantId: string, name: string): Promise<string | null> {
        const cred = await db.query.credentials.findFirst({
            where: and(
                eq(credentials.tenantId, tenantId),
                eq(credentials.name, name.toUpperCase())
            ),
        });
        if (!cred) return null;
        return decrypt(cred.encryptedValue);
    }

    /**
     * List credential names and metadata (NEVER returns actual values).
     */
    async list(tenantId: string, agentId?: string): Promise<CredentialInfo[]> {
        const creds = await db.query.credentials.findMany({
            where: and(
                eq(credentials.tenantId, tenantId),
                agentId
                    ? or(eq(credentials.agentId, agentId), isNull(credentials.agentId))
                    : undefined
            ),
        });

        return creds.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.credentialType || "api_key",
            description: c.description,
            agentId: c.agentId,
            metadata: (c.metadata as Record<string, any>) || {},
            updatedAt: c.updatedAt,
        }));
    }

    /**
     * Delete a credential.
     */
    async remove(tenantId: string, name: string): Promise<void> {
        await db
            .delete(credentials)
            .where(
                and(
                    eq(credentials.tenantId, tenantId),
                    eq(credentials.name, name.toUpperCase())
                )
            );
        logger.info({ tenantId, name }, "Credential removed");
    }

    /**
     * Build env vars map for sandbox/exec injection.
     * Returns decrypted credentials as { KEY_NAME: "actual-value" }.
     * Also injects metadata base URLs as KEY_NAME_URL.
     */
    async getEnvVars(tenantId: string, agentId?: string): Promise<Record<string, string>> {
        const creds = await db.query.credentials.findMany({
            where: and(
                eq(credentials.tenantId, tenantId),
                agentId
                    ? or(eq(credentials.agentId, agentId), isNull(credentials.agentId))
                    : isNull(credentials.agentId)
            ),
        });

        const envVars: Record<string, string> = {};

        for (const cred of creds) {
            try {
                envVars[cred.name] = decrypt(cred.encryptedValue);

                // Inject metadata as additional env vars
                const meta = cred.metadata as Record<string, any>;
                if (meta?.baseUrl) {
                    envVars[`${cred.name}_URL`] = meta.baseUrl;
                }
                if (meta?.host) {
                    envVars[`${cred.name}_HOST`] = meta.host;
                }
            } catch (err) {
                logger.error({ err, tenantId, name: cred.name }, "Failed to decrypt credential");
            }
        }

        return envVars;
    }
}

// Singleton
export const credentialVault = new CredentialVault();
