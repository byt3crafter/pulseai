import "server-only";
import { auth } from "../auth";
import { hasPermission, type Permission, type Plane } from "./permissions";

/**
 * Resolve the current user's access context for UI gating in server components.
 * Server actions still enforce independently (via requireAdmin/requireTenant) —
 * this only decides what controls to *show*.
 */
export interface CurrentAccess {
    authenticated: boolean;
    role: string | null; // "ADMIN" | "TENANT"
    accessRole: string; // owner | admin | support | auditor | member | viewer
    plane: Plane | null;
    can: (perm: Permission) => boolean;
}

export async function currentAccess(): Promise<CurrentAccess> {
    const session = await auth().catch(() => null);
    const u = session?.user as any;
    const role: string | null = u?.role ?? null;
    const accessRole: string = u?.accessRole || "owner";
    const plane: Plane | null = role === "ADMIN" ? "platform" : role === "TENANT" ? "tenant" : null;

    return {
        authenticated: !!u,
        role,
        accessRole,
        plane,
        can: (perm: Permission) => (plane ? hasPermission(plane, accessRole, perm) : false),
    };
}
