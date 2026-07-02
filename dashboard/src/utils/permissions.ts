/**
 * RBAC permission model.
 *
 * `role` (users.role = ADMIN | TENANT) selects the PLANE (platform vs tenant)
 * and drives routing — unchanged, so existing checks keep working.
 * `accessRole` selects the granular role WITHIN the plane. Existing users
 * default to "owner" (full access), so nothing changes until roles are assigned.
 */

export type Plane = "platform" | "tenant";
export type PlatformRole = "owner" | "admin" | "support" | "auditor";
export type TenantRole = "owner" | "member" | "viewer";
export type AccessRole = PlatformRole | TenantRole;

export type Permission =
    // ── platform plane ──
    | "platform.tenants.read"
    | "platform.tenants.write"
    | "platform.tenants.delete"
    | "platform.users.read"
    | "platform.users.write"
    | "platform.users.delete"
    | "platform.users.reset"
    | "platform.settings.read"
    | "platform.settings.write"
    | "platform.billing.write"
    | "platform.plugins.write"
    | "platform.conversations.read"
    | "platform.usage.read"
    | "platform.audit.read"
    // ── tenant plane ──
    | "tenant.agents.read"
    | "tenant.agents.write"
    | "tenant.members.read"
    | "tenant.members.write"
    | "tenant.settings.write"
    | "tenant.credentials.write"
    | "tenant.billing.read"
    | "tenant.conversations.read";

const ALL_PLATFORM: Permission[] = [
    "platform.tenants.read", "platform.tenants.write", "platform.tenants.delete",
    "platform.users.read", "platform.users.write", "platform.users.delete", "platform.users.reset",
    "platform.settings.read", "platform.settings.write", "platform.billing.write",
    "platform.plugins.write", "platform.conversations.read", "platform.usage.read", "platform.audit.read",
];

const ALL_TENANT: Permission[] = [
    "tenant.agents.read", "tenant.agents.write", "tenant.members.read", "tenant.members.write",
    "tenant.settings.write", "tenant.credentials.write", "tenant.billing.read", "tenant.conversations.read",
];

const PLATFORM_PERMS: Record<PlatformRole, Permission[]> = {
    owner: ALL_PLATFORM,
    // Admin: everything except destructive deletes and billing changes
    admin: [
        "platform.tenants.read", "platform.tenants.write",
        "platform.users.read", "platform.users.write", "platform.users.reset",
        "platform.settings.read", "platform.settings.write",
        "platform.plugins.write", "platform.conversations.read", "platform.usage.read", "platform.audit.read",
    ],
    // Support: read + password resets, no config changes / deletes
    support: [
        "platform.tenants.read", "platform.users.read", "platform.users.reset",
        "platform.settings.read", "platform.conversations.read", "platform.usage.read", "platform.audit.read",
    ],
    // Auditor: strictly read-only
    auditor: [
        "platform.tenants.read", "platform.users.read", "platform.settings.read",
        "platform.conversations.read", "platform.usage.read", "platform.audit.read",
    ],
};

const TENANT_PERMS: Record<TenantRole, Permission[]> = {
    owner: ALL_TENANT,
    // Member: configure/use agents, no member management or billing
    member: [
        "tenant.agents.read", "tenant.agents.write", "tenant.settings.write",
        "tenant.credentials.write", "tenant.conversations.read", "tenant.members.read",
    ],
    // Viewer: read-only
    viewer: ["tenant.agents.read", "tenant.conversations.read", "tenant.billing.read", "tenant.members.read"],
};

/** Normalize any legacy/blank value to a safe default ("owner" = full access). */
export function normalizeAccessRole(value: string | null | undefined): AccessRole {
    const v = (value || "").toLowerCase();
    if (["owner", "admin", "support", "auditor", "member", "viewer"].includes(v)) return v as AccessRole;
    return "owner";
}

export function hasPermission(plane: Plane, accessRole: string | null | undefined, perm: Permission): boolean {
    const role = normalizeAccessRole(accessRole);
    if (plane === "platform") return (PLATFORM_PERMS[role as PlatformRole] ?? []).includes(perm);
    return (TENANT_PERMS[role as TenantRole] ?? []).includes(perm);
}

export const PLATFORM_ROLES: PlatformRole[] = ["owner", "admin", "support", "auditor"];
export const TENANT_ROLES: TenantRole[] = ["owner", "member", "viewer"];

export const ROLE_LABELS: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    support: "Support",
    auditor: "Auditor",
    member: "Member",
    viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
    owner: "Full control",
    admin: "Manage, no destructive actions",
    support: "Read + password resets",
    auditor: "Read-only",
    member: "Configure & use agents",
    viewer: "Read-only",
};
