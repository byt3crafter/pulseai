import { NextResponse } from "next/server";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../storage/db";
import { apiTokens } from "../../../../storage/schema";
import { requireTenant } from "../../../../utils/tenant-auth";

export const dynamic = "force-dynamic";

/**
 * Mint a short-lived gateway token for the 3D office, for the signed-in user.
 *
 * The office (Hermes3D) runs same-origin under /office and talks to the Pulse
 * gateway server-side. It has no session of its own and upstream expects a
 * hand-configured token pasted into its settings — which would mean a second
 * login and a token that is not scoped to whoever is actually looking at it.
 *
 * Instead the office asks here, forwarding the caller's dashboard cookie. The
 * session decides the tenant and the user, exactly like the assistant's chat
 * token does, so the office can only ever see the workspace of the person
 * viewing it. There is nothing for anyone to configure and nothing to paste.
 */
const OFFICE_TOKEN_NAME = "__office__";

export async function GET() {
    const check = await requireTenant();
    if (!check.authorized) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Replace only THIS user's office token — never another member's.
        await db.delete(apiTokens).where(and(
            eq(apiTokens.tenantId, check.tenantId),
            eq(apiTokens.name, OFFICE_TOKEN_NAME),
            eq(apiTokens.userId, check.userId),
        ));

        const raw = `pulse-sk-${crypto.randomBytes(32).toString("hex")}`;
        await db.insert(apiTokens).values({
            tenantId: check.tenantId,
            userId: check.userId,
            tokenHash: crypto.createHash("sha256").update(raw).digest("hex"),
            name: OFFICE_TOKEN_NAME,
            scopes: ["chat"],
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        });

        return NextResponse.json({ token: raw, expiresInSeconds: 12 * 60 * 60 });
    } catch (error) {
        console.error("Failed to mint office token:", error);
        return NextResponse.json({ error: "Could not start the office session." }, { status: 500 });
    }
}
