import { KeyIcon } from "@heroicons/react/24/outline";
import { db } from "../../../../../storage/db";
import { credentials, tenants } from "../../../../../storage/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function deleteCredentialAction(formData: FormData) {
    "use server";
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
        <div className="p-8 max-w-5xl mx-auto">
            <div className="mb-8">
                <a href={`/admin/tenants/${tenantId}`} className="text-sm text-indigo-600 hover:text-indigo-700 mb-2 inline-block">
                    &larr; Back to {tenant.name}
                </a>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-50 rounded-lg">
                        <KeyIcon className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Credentials — {tenant.name}</h1>
                        <p className="text-slate-500 text-sm">Admin view of tenant API credentials (values never shown).</p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-900">Stored Credentials</h2>
                    <p className="text-sm text-slate-500 mt-1">{creds.length} credential(s).</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                                <th className="px-6 py-3 font-medium">Name</th>
                                <th className="px-6 py-3 font-medium">Type</th>
                                <th className="px-6 py-3 font-medium">Description</th>
                                <th className="px-6 py-3 font-medium">Updated</th>
                                <th className="px-6 py-3 font-medium">Admin Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {creds.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-400">
                                        No credentials stored for this tenant.
                                    </td>
                                </tr>
                            )}
                            {creds.map((cred) => (
                                <tr key={cred.id} className="border-b border-slate-50 hover:bg-slate-50">
                                    <td className="px-6 py-3 font-mono text-sm font-medium text-slate-900">{cred.name}</td>
                                    <td className="px-6 py-3">
                                        <span className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded-full">{cred.credentialType}</span>
                                    </td>
                                    <td className="px-6 py-3 text-sm text-slate-500">{cred.description || "—"}</td>
                                    <td className="px-6 py-3 text-xs text-slate-400">
                                        {cred.updatedAt ? new Date(cred.updatedAt).toLocaleDateString() : "—"}
                                    </td>
                                    <td className="px-6 py-3">
                                        <form action={deleteCredentialAction}>
                                            <input type="hidden" name="credentialId" value={cred.id} />
                                            <input type="hidden" name="tenantId" value={tenantId} />
                                            <button type="submit" className="text-xs text-red-600 hover:text-red-800 font-medium">
                                                Delete (Admin)
                                            </button>
                                        </form>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
