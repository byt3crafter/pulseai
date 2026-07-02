import "server-only";
import { db } from "../storage/db";
import { globalSettings, users } from "../storage/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "./crypto";
import { normalizeAccessRole } from "./permissions";

/**
 * Deployment-level OIDC SSO. Configured in Admin → Settings → SSO and stored
 * (encrypted secret) in global_settings.config.sso. SSO is INACTIVE until an
 * admin enables it, so existing email/password login is unaffected by default.
 */

export interface StoredSso {
    enabled: boolean;
    name: string; // button label, e.g. "Okta" / "Microsoft" / "Google"
    issuer: string; // OIDC issuer / discovery base URL
    clientId: string;
    clientSecretEnc?: string;
    allowedDomains: string[]; // email domains permitted (empty = any)
    groupClaim: string; // claim holding the user's groups (e.g. "groups")
    groupRoleMap: Record<string, string>; // IdP group -> accessRole
    defaultRole: string; // fallback accessRole for users with no mapped group
    plane: "platform" | "tenant";
    tenantId?: string | null; // required when plane = "tenant"
}

export interface ResolvedSso {
    name: string;
    issuer: string;
    clientId: string;
    clientSecret: string;
    allowedDomains: string[];
    groupClaim: string;
    groupRoleMap: Record<string, string>;
    defaultRole: string;
    plane: "platform" | "tenant";
    tenantId: string | null;
}

async function loadStored(): Promise<StoredSso | null> {
    try {
        const row = (await db.query.globalSettings.findFirst({
            where: eq(globalSettings.id, "root"),
        })) as any;
        return row?.config?.sso ?? null;
    } catch (error) {
        console.error("[sso] failed to load config:", error);
        return null;
    }
}

/** Public: is SSO active? (used to show the login button). No secrets returned. */
export async function ssoStatus(): Promise<{ enabled: boolean; name: string }> {
    const s = await loadStored();
    return { enabled: !!(s?.enabled && s.issuer && s.clientId && s.clientSecretEnc), name: s?.name || "SSO" };
}

/** Resolve full config with decrypted secret — only for the auth layer. */
export async function resolveSso(): Promise<ResolvedSso | null> {
    const s = await loadStored();
    if (!s || !s.enabled || !s.issuer || !s.clientId || !s.clientSecretEnc) return null;
    let clientSecret: string;
    try {
        clientSecret = decrypt(s.clientSecretEnc);
    } catch {
        console.error("[sso] failed to decrypt client secret");
        return null;
    }
    return {
        name: s.name || "SSO",
        issuer: s.issuer,
        clientId: s.clientId,
        clientSecret,
        allowedDomains: s.allowedDomains ?? [],
        groupClaim: s.groupClaim || "groups",
        groupRoleMap: s.groupRoleMap ?? {},
        defaultRole: s.defaultRole || (s.plane === "tenant" ? "viewer" : "auditor"),
        plane: s.plane === "tenant" ? "tenant" : "platform",
        tenantId: s.tenantId ?? null,
    };
}

/** Map IdP group memberships to a Pulse accessRole. */
function mapGroupsToRole(cfg: ResolvedSso, groups: string[]): string {
    for (const g of groups) {
        const mapped = cfg.groupRoleMap[g];
        if (mapped) return normalizeAccessRole(mapped);
    }
    return normalizeAccessRole(cfg.defaultRole);
}

/**
 * Just-in-time provisioning: given the verified OIDC profile, find or create the
 * Pulse user and return the fields the session needs. Returns null to deny login.
 */
export async function provisionSsoUser(
    profile: Record<string, unknown>,
): Promise<{ id: string; role: string; accessRole: string; tenantId: string | null } | null> {
    const cfg = await resolveSso();
    if (!cfg) return null;

    const email = String(profile.email || "").trim().toLowerCase();
    if (!email) return null;

    // Domain allowlist
    if (cfg.allowedDomains.length > 0) {
        const domain = email.split("@")[1] || "";
        if (!cfg.allowedDomains.map((d) => d.toLowerCase()).includes(domain)) return null;
    }

    const rawGroups = profile[cfg.groupClaim];
    const groups = Array.isArray(rawGroups) ? (rawGroups as unknown[]).map(String) : [];
    const accessRole = mapGroupsToRole(cfg, groups);
    const role = cfg.plane === "tenant" ? "TENANT" : "ADMIN";
    const tenantId = cfg.plane === "tenant" ? cfg.tenantId : null;

    try {
        // Match by email case-insensitively
        const existing = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0]
            ?? (await db.select().from(users).where(eq(users.email, profile.email as string)).limit(1))[0];

        if (existing) {
            // Keep role in sync with IdP group mapping on each login (SSO is source of truth).
            await db.update(users)
                .set({ accessRole, lastLoginAt: new Date(), updatedAt: new Date() })
                .where(eq(users.id, existing.id));
            return { id: existing.id, role: existing.role, accessRole, tenantId: existing.tenantId };
        }

        const [created] = await db.insert(users).values({
            email,
            name: (profile.name as string) || email,
            passwordHash: "!sso", // SSO users have no local password
            role,
            accessRole,
            tenantId,
            mustChangePassword: false,
            onboardingComplete: true,
            lastLoginAt: new Date(),
        }).returning({ id: users.id });

        return { id: created.id, role, accessRole, tenantId };
    } catch (error) {
        console.error("[sso] JIT provisioning failed:", error);
        return null;
    }
}
