import { db } from "../../../storage/db";
import { users, tenants } from "../../../storage/schema";
import { eq } from "drizzle-orm";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const allUsers = await db
        .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            tenantId: users.tenantId,
            tenantName: tenants.name,
            mustChangePassword: users.mustChangePassword,
            lastLoginAt: users.lastLoginAt,
            createdAt: users.createdAt,
        })
        .from(users)
        .leftJoin(tenants, eq(users.tenantId, tenants.id));

    const allTenants = await db
        .select({ id: tenants.id, name: tenants.name })
        .from(tenants);

    const serializedUsers = allUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        tenantId: u.tenantId,
        tenantName: u.tenantName,
        mustChangePassword: u.mustChangePassword,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt?.toISOString() ?? "",
    }));

    const serializedTenants = allTenants.map((t) => ({
        id: t.id,
        name: t.name,
    }));

    return (
        <UsersClient users={serializedUsers} tenants={serializedTenants} />
    );
}
