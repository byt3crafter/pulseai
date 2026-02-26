import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { db } from "../../../../storage/db";
import { globalSettings } from "../../../../storage/schema";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function saveSandboxSettings(formData: FormData) {
    "use server";
    const currentSettings = await db.query.globalSettings.findFirst({
        where: (table, { eq }) => eq(table.id, "root"),
    });
    const gwConfig: any = currentSettings?.gatewayConfig
        ? { ...(currentSettings.gatewayConfig as any) }
        : {};

    gwConfig.python_sandbox = {
        image: formData.get("pythonImage") as string || "pulse-python-sandbox:latest",
        memory_limit: formData.get("memoryLimit") as string || "256m",
        cpu_limit: formData.get("cpuLimit") as string || "1.0",
        default_timeout: parseInt(formData.get("defaultTimeout") as string) || 60,
        max_timeout: parseInt(formData.get("maxTimeout") as string) || 300,
        network_enabled: formData.get("networkEnabled") === "on",
    };

    await db
        .insert(globalSettings)
        .values({ id: "root", gatewayConfig: gwConfig, updatedAt: new Date() })
        .onConflictDoUpdate({
            target: globalSettings.id,
            set: { gatewayConfig: gwConfig, updatedAt: new Date() },
        });

    revalidatePath("/admin/settings/sandbox");
}

export default async function SandboxConfigPage() {
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const settings = await db.query.globalSettings.findFirst({
        where: (table, { eq }) => eq(table.id, "root"),
    });
    const gwConfig = (settings?.gatewayConfig || {}) as any;
    const sandbox = gwConfig.python_sandbox || {};

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="mb-8">
                <a href="/admin/settings" className="text-sm text-indigo-600 hover:text-indigo-700 mb-2 inline-block">&larr; Back to Settings</a>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-violet-50 rounded-lg">
                        <Cog6ToothIcon className="w-6 h-6 text-violet-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Sandbox Configuration</h1>
                </div>
                <p className="text-slate-500">Configure the Python sandbox Docker image and resource limits for agent code execution.</p>
            </div>

            <form action={saveSandboxSettings} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Python Docker Image</label>
                        <input
                            type="text"
                            name="pythonImage"
                            defaultValue={sandbox.image || "pulse-python-sandbox:latest"}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono"
                        />
                        <p className="text-xs text-slate-400 mt-1">Build with: docker build -t pulse-python-sandbox pulse/docker/python-sandbox/</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Memory Limit</label>
                            <select
                                name="memoryLimit"
                                defaultValue={sandbox.memory_limit || "256m"}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"
                            >
                                <option value="128m">128 MB</option>
                                <option value="256m">256 MB</option>
                                <option value="512m">512 MB</option>
                                <option value="1g">1 GB</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">CPU Limit</label>
                            <select
                                name="cpuLimit"
                                defaultValue={sandbox.cpu_limit || "1.0"}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"
                            >
                                <option value="0.5">0.5 CPU</option>
                                <option value="1.0">1.0 CPU</option>
                                <option value="2.0">2.0 CPU</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Default Timeout (seconds)</label>
                            <input
                                type="number"
                                name="defaultTimeout"
                                defaultValue={sandbox.default_timeout || 60}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Max Timeout (seconds)</label>
                            <input
                                type="number"
                                name="maxTimeout"
                                defaultValue={sandbox.max_timeout || 300}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900"
                            />
                        </div>
                    </div>

                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            name="networkEnabled"
                            defaultChecked={sandbox.network_enabled !== false}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        />
                        <div>
                            <span className="text-sm font-medium text-slate-900">Network Access</span>
                            <p className="text-xs text-slate-500">Allow sandbox containers to make outbound API calls</p>
                        </div>
                    </label>

                    <div className="flex justify-end">
                        <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors">
                            Save Configuration
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
