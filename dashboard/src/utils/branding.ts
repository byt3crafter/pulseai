import { db } from "../storage/db";
import { globalSettings } from "../storage/schema";
import { eq } from "drizzle-orm";

/**
 * Per-deployment branding (company/product name, logo). Stored in
 * globalSettings.config.branding so a deployment can be white-labelled without
 * any code change — set it in Admin → Settings → Branding. Defaults preserve the
 * original "Pulse AI" look so nothing changes until it's set.
 */
export interface Branding {
    productName: string;   // replaces "Pulse AI" in headers, login, admin
    companyName: string;   // footer / copyright
    logoDataUrl: string | null; // optional square logo (data URL); falls back to the default mark
    supportEmail: string | null;
}

export const BRANDING_DEFAULTS: Branding = {
    productName: "Pulse AI",
    companyName: "Runstate Ltd",
    logoDataUrl: null,
    supportEmail: null,
};

export async function getBranding(): Promise<Branding> {
    try {
        const row = await db
            .select({ config: globalSettings.config })
            .from(globalSettings)
            .where(eq(globalSettings.id, "root"))
            .limit(1);
        const b = ((row[0]?.config as any)?.branding ?? {}) as Partial<Branding>;
        return {
            productName: (b.productName || "").trim() || BRANDING_DEFAULTS.productName,
            companyName: (b.companyName || "").trim() || BRANDING_DEFAULTS.companyName,
            logoDataUrl: b.logoDataUrl || null,
            supportEmail: b.supportEmail || null,
        };
    } catch {
        return BRANDING_DEFAULTS;
    }
}

/** The environment host shown in the admin shell — derived from the deploy URL. */
export function deploymentHost(): string {
    const url = process.env.NEXTAUTH_URL || process.env.WEBHOOK_BASE_URL || "";
    try {
        return url ? new URL(url).host : "local";
    } catch {
        return url.replace(/^https?:\/\//, "") || "local";
    }
}
