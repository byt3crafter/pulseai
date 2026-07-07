import { KeyIcon } from "@heroicons/react/24/outline";
import { getCredentials, getTenantAgents, addCredential } from "./actions";
import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import DeleteCredentialButton from "./DeleteCredentialButton";

export const dynamic = "force-dynamic";

export default async function CredentialsPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user) return redirect("/auth/login");
    const tenantId = (session.user as any).tenantId;
    if (!tenantId) return redirect("/auth/login");

    const creds = await getCredentials(tenantId);
    const agents = await getTenantAgents(tenantId);

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-amber-500/10 rounded-lg">
                        <KeyIcon className="w-6 h-6 text-amber-400" />
                    </div>
                    <h1 className="text-3xl font-bold text-pulse-text tracking-tight">API Credentials</h1>
                </div>
                <p className="text-pulse-muted">
                    Store API keys and secrets securely. Agents access these as environment variables in code execution.
                </p>
            </div>

            <div className="space-y-6">
                {/* Add Credential Form */}
                <form action={addCredential} className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle overflow-hidden">
                    <div className="p-6 border-b border-pulse-border-subtle">
                        <h2 className="text-lg font-semibold text-pulse-text">Add Credential</h2>
                    </div>
                    <div className="p-6 space-y-4">
                        <input type="hidden" name="tenantId" value={tenantId} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-pulse-text-soft mb-1">Name (env var name)</label>
                                <input
                                    type="text"
                                    name="name"
                                    required
                                    placeholder="ERPNEXT_API_KEY"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint font-mono uppercase focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                />
                                <p className="text-xs text-pulse-faint mt-1">Auto-uppercased. Agents use: os.environ[&quot;NAME&quot;]</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-pulse-text-soft mb-1">Type</label>
                                <select
                                    name="credentialType"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                >
                                    <option value="api_key">API Key</option>
                                    <option value="bearer">Bearer Token</option>
                                    <option value="basic">Basic Auth</option>
                                    <option value="oauth2">OAuth2</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-pulse-text-soft mb-1">Value (secret)</label>
                            <input
                                type="password"
                                name="value"
                                required
                                placeholder="Your API key or secret"
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                            />
                            <p className="text-xs text-pulse-faint mt-1">Encrypted at rest with AES-256-GCM. Never shown after saving.</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-pulse-text-soft mb-1">Description</label>
                                <input
                                    type="text"
                                    name="description"
                                    placeholder="What this credential is for"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-pulse-text-soft mb-1">Base URL (optional)</label>
                                <input
                                    type="text"
                                    name="baseUrl"
                                    placeholder="https://erp.company.com"
                                    className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text placeholder:text-pulse-faint focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                />
                                <p className="text-xs text-pulse-faint mt-1">Injected as NAME_URL env var</p>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-pulse-text-soft mb-1">Agent Scope</label>
                            <select
                                name="agentId"
                                className="w-full px-3 py-2 border border-pulse-border rounded-lg text-sm bg-pulse-panel text-pulse-text focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                            >
                                <option value="">All Agents</option>
                                {agents.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors motion-reduce:transition-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-pulse-panel"
                            >
                                Add Credential
                            </button>
                        </div>
                    </div>
                </form>

                {/* Credentials Table */}
                <div className="bg-pulse-panel rounded-xl shadow-sm border border-pulse-border-subtle overflow-hidden">
                    <div className="p-6 border-b border-pulse-border-subtle">
                        <h2 className="text-lg font-semibold text-pulse-text">Stored Credentials</h2>
                        <p className="text-sm text-pulse-muted mt-1">{creds.length} credential(s) configured.</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="text-left text-xs text-pulse-muted border-b border-pulse-border-subtle">
                                    <th className="px-6 py-3 font-medium">Name</th>
                                    <th className="px-6 py-3 font-medium">Type</th>
                                    <th className="px-6 py-3 font-medium">Description</th>
                                    <th className="px-6 py-3 font-medium">Scope</th>
                                    <th className="px-6 py-3 font-medium">Updated</th>
                                    <th className="px-6 py-3 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {creds.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-8 text-center text-sm text-pulse-faint">
                                            No credentials stored yet. Add one above.
                                        </td>
                                    </tr>
                                )}
                                {creds.map((cred) => (
                                    <tr key={cred.id} className="border-b border-pulse-border-subtle hover:bg-pulse-hover transition-colors motion-reduce:transition-none">
                                        <td className="px-6 py-3 font-mono text-sm font-medium text-pulse-text">{cred.name}</td>
                                        <td className="px-6 py-3">
                                            <span className="px-2 py-1 text-xs bg-pulse-panel-alt text-pulse-muted rounded-full">{cred.credentialType}</span>
                                        </td>
                                        <td className="px-6 py-3 text-sm text-pulse-muted">{cred.description || "—"}</td>
                                        <td className="px-6 py-3 text-sm text-pulse-muted">
                                            {cred.agentId
                                                ? agents.find((a) => a.id === cred.agentId)?.name || "Specific Agent"
                                                : "All Agents"}
                                        </td>
                                        <td className="px-6 py-3 text-xs text-pulse-faint">
                                            {cred.updatedAt ? new Date(cred.updatedAt).toLocaleDateString() : "—"}
                                        </td>
                                        <td className="px-6 py-3">
                                            <DeleteCredentialButton credentialId={cred.id} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
