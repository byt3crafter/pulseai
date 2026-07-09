import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../storage/db";
import { users, channels, channelMembers, passwordResetTokens } from "../../../storage/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { hasPermission } from "../../../utils/permissions";
import TeamClient from "./TeamClient";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");

    const tenantId = session.user.tenantId as string;
    const currentUserId = session.user.id as string;
    const effectiveAccessRole = (session.user as any).role === "ADMIN" ? "owner" : (session.user as any).accessRole || "owner";
    const canManage = hasPermission("tenant", effectiveAccessRole, "tenant.members.write");

    const [memberRows, channelRows] = await Promise.all([
        db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,
                accessRole: users.accessRole,
                twoFactorEnabled: users.twoFactorEnabled,
                lastLoginAt: users.lastLoginAt,
                createdAt: users.createdAt,
            })
            .from(users)
            .where(and(eq(users.tenantId, tenantId), eq(users.role, "TENANT"))),
        db.select().from(channels).where(eq(channels.tenantId, tenantId)),
    ]);

    const userIds = memberRows.map((u) => u.id);
    const channelIds = channelRows.map((c) => c.id);

    const [memberships, unusedInviteTokens] = await Promise.all([
        channelIds.length
            ? db.select().from(channelMembers).where(inArray(channelMembers.channelId, channelIds))
            : Promise.resolve([] as (typeof channelMembers.$inferSelect)[]),
        userIds.length
            ? db
                  .select({ userId: passwordResetTokens.userId })
                  .from(passwordResetTokens)
                  .where(and(inArray(passwordResetTokens.userId, userIds), isNull(passwordResetTokens.usedAt)))
            : Promise.resolve([] as { userId: string }[]),
    ]);

    const invitedUserIds = new Set(unusedInviteTokens.map((t) => t.userId));
    const channelById = new Map(channelRows.map((c) => [c.id, c]));

    const pathFor = (channelId: string): string => {
        const ch = channelById.get(channelId);
        if (!ch) return "Unknown";
        if (ch.parentId) {
            const parent = channelById.get(ch.parentId);
            return parent ? `${parent.name} › ${ch.name}` : ch.name;
        }
        return ch.name;
    };

    const departmentsByUser = new Map<string, { channelId: string; path: string; access: string }[]>();
    for (const m of memberships) {
        const list = departmentsByUser.get(m.userId) || [];
        list.push({ channelId: m.channelId, path: pathFor(m.channelId), access: m.access });
        departmentsByUser.set(m.userId, list);
    }

    const members = memberRows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        accessRole: u.accessRole,
        twoFactorEnabled: u.twoFactorEnabled,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        status: (invitedUserIds.has(u.id) && !u.lastLoginAt ? "invited" : "active") as "invited" | "active",
        departments: departmentsByUser.get(u.id) || [],
    }));

    const departments = channelRows.filter((c) => c.kind === "department");
    const channelOptions = departments.flatMap((dept) => [
        { id: dept.id, path: dept.name, kind: "department" as const },
        ...channelRows
            .filter((g) => g.kind === "group" && g.parentId === dept.id)
            .map((g) => ({ id: g.id, path: `${dept.name} › ${g.name}`, kind: "group" as const })),
    ]);

    return (
        <TeamClient
            members={members}
            channelOptions={channelOptions}
            currentUserId={currentUserId}
            canManage={canManage}
        />
    );
}
