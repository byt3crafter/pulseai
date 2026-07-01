import { db } from "../../../../../storage/db";
import { pairingCodes, allowlists } from "../../../../../storage/schema";
import { eq, and } from "drizzle-orm";
import Link from "next/link";
import ApprovalsClient from "./ApprovalsClient";
import { ui, PageHeader } from "../../../../../components/admin/ui";

export default async function ApprovalsPage({
    params,
}: {
    params: Promise<{ tenantId: string }>;
}) {
    const { tenantId } = await params;

    // Bypass during build phase
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) {
        return <div>Building Component</div>;
    }

    const pendingPairings = await db
        .select({
            id: pairingCodes.id,
            code: pairingCodes.code,
            contactId: pairingCodes.contactId,
            contactName: pairingCodes.contactName,
            createdAt: pairingCodes.createdAt,
        })
        .from(pairingCodes)
        .where(and(eq(pairingCodes.tenantId, tenantId), eq(pairingCodes.status, "pending")));

    const approvedUsers = await db
        .select({
            id: allowlists.id,
            contactId: allowlists.contactId,
            contactName: allowlists.contactName,
            contactType: allowlists.contactType,
            status: allowlists.status,
        })
        .from(allowlists)
        .where(
            and(
                eq(allowlists.tenantId, tenantId),
                eq(allowlists.channelType, "telegram"),
                eq(allowlists.contactType, "user"),
                eq(allowlists.status, "approved")
            )
        );

    const approvedGroups = await db
        .select({
            id: allowlists.id,
            contactId: allowlists.contactId,
            contactName: allowlists.contactName,
            contactType: allowlists.contactType,
            status: allowlists.status,
        })
        .from(allowlists)
        .where(
            and(
                eq(allowlists.tenantId, tenantId),
                eq(allowlists.channelType, "telegram"),
                eq(allowlists.contactType, "group"),
                eq(allowlists.status, "approved")
            )
        );

    return (
        <div className={ui.page}>
            <div>
                <Link
                    href={`/admin/tenants/${tenantId}`}
                    className={`${ui.btnGhost} inline-block mb-2`}
                >
                    &larr; Back to Tenant Settings
                </Link>
                <PageHeader
                    title="Approvals & Allowlists"
                    subtitle="Manage DM pairing approvals and group chat access."
                />
            </div>

            <ApprovalsClient
                tenantId={tenantId}
                pendingPairings={pendingPairings}
                approvedUsers={approvedUsers}
                approvedGroups={approvedGroups}
            />
        </div>
    );
}
