import { db } from "../../../../../storage/db";
import { credentials, tenants } from "../../../../../storage/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../../../../utils/admin-auth";
import { ui, PageHeader, Panel, Badge } from "../../../../../components/admin/ui";

export const dynamic = "force-dynamic";

async function deleteCredentialAction(formData: FormData) {
    "use server";
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return;

    const credentialId = formData.get("credentialId") as string;
    const tenantId = formData.get("tenantId") as string;
    await db.delete(credentials).where(eq(credentials.id, credentialId));
    revalidatePath(`/admin/tenants/${tenantId}/credentials`);
}

export default async function AdminTenantCredentialsPage({ params }: { params: Promise<{ tenantId: string }> }) {
    const { tenantId } = await params;

    const isNextBuild =
        process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
    if (!tenant) return notFound();

    const creds = await db.query.credentials.findMany({
        where: eq(credentials.tenantId, tenantId),
        columns: {
            id: true,
            name: true,
            description: true,
            credentialType: true,
            agentId: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    return (
        <div className={ui.page}>
            <div>
                <a href={`/admin/tenants/${tenantId}`} className={`${ui.btnGhost} inline-block mb-2`}>
                    &larr; Back to {tenant.name}
                </a>
                <PageHeader
                    title={`Credentials — ${tenant.name}`}
                    subtitle="Admin view of tenant API credentials (values never shown)."
                />
            </div>

            <Panel bodyClassName="p-0">
                <div className="px-4 py-3 border-b border-[#242429]">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-[#8A8A90]">Stored Credentials</span>
                    <span className="text-[11px] text-[#5A5A61] ml-2">{creds.length} credential(s)</span>
                </div>
                <div className="overflow-x-auto">
                    <table className={ui.table}>
                        <thead>
                            <tr>
                                <th className={ui.th}>Name</th>
                                <th className={ui.th}>Type</th>
                                <th className={ui.th}>Description</th>
                                <th className={ui.th}>Updated</th>
                                <th className={ui.thRight}>Admin Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {creds.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-[13px] text-[#5A5A61]">
                                        No credentials stored for this tenant.
                                    </td>
                                </tr>
                            )}
                            {creds.map((cred) => (
                                <tr key={cred.id} className={ui.row}>
                                    <td className={ui.td}>{cred.name}</td>
                                    <td className={ui.td}>
                                        <Badge variant="neutral">{cred.credentialType}</Badge>
                                    </td>
                                    <td className={ui.tdMuted}>{cred.description || "—"}</td>
                                    <td className={ui.tdMuted}>
                                        {cred.updatedAt ? new Date(cred.updatedAt).toLocaleDateString() : "—"}
                                    </td>
                                    <td className={ui.tdRight}>
                                        <form action={deleteCredentialAction} className="inline">
                                            <input type="hidden" name="credentialId" value={cred.id} />
                                            <input type="hidden" name="tenantId" value={tenantId} />
                                            <button type="submit" className={ui.btnDanger}>
                                                Delete (Admin)
                                            </button>
                                        </form>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Panel>
        </div>
    );
}
