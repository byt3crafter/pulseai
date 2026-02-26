import { db } from "../../storage/db.js";
import { allowlists, pairingCodes } from "../../storage/schema.js";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { logger } from "../../utils/logger.js";

export type DmAccessStatus = "approved" | "pending" | "blocked" | "unknown";

/**
 * Check whether a contact is allowed to DM the bot for a given tenant.
 */
export async function checkDmAccess(
    tenantId: string,
    contactId: string
): Promise<DmAccessStatus> {
    const entry = await db.query.allowlists.findFirst({
        where: and(
            eq(allowlists.tenantId, tenantId),
            eq(allowlists.channelType, "telegram"),
            eq(allowlists.contactId, contactId)
        ),
    });

    if (!entry) return "unknown";
    return entry.status as DmAccessStatus;
}

/**
 * Generate (or return existing) 8-char pairing code for a contact.
 * Also upserts a "pending" allowlist entry.
 */
export async function getOrCreatePairingCode(
    tenantId: string,
    contactId: string,
    contactName?: string
): Promise<string> {
    // Check for existing non-expired pending code
    const existing = await db.query.pairingCodes.findFirst({
        where: and(
            eq(pairingCodes.tenantId, tenantId),
            eq(pairingCodes.contactId, contactId),
            eq(pairingCodes.status, "pending")
        ),
    });

    if (existing && existing.expiresAt > new Date()) {
        return existing.code;
    }

    // Generate a new 8-char alphanumeric code
    const code = randomBytes(4)
        .toString("hex")
        .toUpperCase()
        .slice(0, 8);

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour TTL

    await db.insert(pairingCodes).values({
        tenantId,
        channelType: "telegram",
        contactId,
        contactName,
        code,
        status: "pending",
        expiresAt,
    });

    // Upsert a pending allowlist entry so the admin can see it
    const existingAllowlist = await db.query.allowlists.findFirst({
        where: and(
            eq(allowlists.tenantId, tenantId),
            eq(allowlists.channelType, "telegram"),
            eq(allowlists.contactId, contactId)
        ),
    });

    if (!existingAllowlist) {
        await db.insert(allowlists).values({
            tenantId,
            channelType: "telegram",
            contactId,
            contactName,
            contactType: "user",
            status: "pending",
        });
    }

    logger.info({ tenantId, contactId, code }, "Generated pairing code");
    return code;
}

/**
 * Approve a pairing code — updates both the pairing_codes and allowlists tables.
 * Returns the approved contact info or null if code not found / expired.
 */
export async function approvePairingCode(
    tenantId: string,
    code: string
): Promise<{ contactId: string; contactName: string | null } | null> {
    const pairingRecord = await db.query.pairingCodes.findFirst({
        where: and(
            eq(pairingCodes.tenantId, tenantId),
            eq(pairingCodes.code, code),
            eq(pairingCodes.status, "pending")
        ),
    });

    if (!pairingRecord) return null;
    if (pairingRecord.expiresAt < new Date()) return null;

    // Update pairing code status
    await db
        .update(pairingCodes)
        .set({ status: "approved" })
        .where(eq(pairingCodes.id, pairingRecord.id));

    // Update allowlist status to approved
    await db
        .update(allowlists)
        .set({ status: "approved" })
        .where(
            and(
                eq(allowlists.tenantId, tenantId),
                eq(allowlists.channelType, "telegram"),
                eq(allowlists.contactId, pairingRecord.contactId)
            )
        );

    logger.info(
        { tenantId, contactId: pairingRecord.contactId, code },
        "Approved pairing code"
    );

    return {
        contactId: pairingRecord.contactId,
        contactName: pairingRecord.contactName,
    };
}
