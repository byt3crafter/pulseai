import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { db } from "../../../../storage/db";
import { globalSettings } from "../../../../storage/schema";
import { revalidatePath } from "next/cache";
import SaveButton from "../../../../components/SaveButton";
import { requireAdmin } from "../../../../utils/admin-auth";

export const dynamic = "force-dynamic";

async function saveMemorySettings(formData: FormData) {
    "use server";
    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return;

    try {
        const currentSettings = await db.query.globalSettings.findFirst({
            where: (table, { eq }) => eq(table.id, "root"),
        });
        const gwConfig: any = currentSettings?.gatewayConfig
            ? { ...(currentSettings.gatewayConfig as any) }
            : {};

        gwConfig.memory_system = {
            enabled: formData.get("enabled") === "on",
            embedding_model: formData.get("embeddingModel") as string || "text-embedding-3-small",
            max_memories_per_agent: parseInt(formData.get("maxMemories") as string) || 10000,
            decay_half_life_days: parseInt(formData.get("decayHalfLife") as string) || 30,
            mmr_lambda: parseFloat(formData.get("mmrLambda") as string) || 0.7,
        };

        await db
            .insert(globalSettings)
            .values({ id: "root", gatewayConfig: gwConfig, updatedAt: new Date() })
            .onConflictDoUpdate({
                target: globalSettings.id,
                set: { gatewayConfig: gwConfig, updatedAt: new Date() },
            });

        revalidatePath("/admin/settings/memory");
    } catch (error) {
        console.error("Failed to save memory settings:", error);
    }
}

export default async function MemorySettingsPage() {
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const settings = await db.query.globalSettings.findFirst({
        where: (table, { eq }) => eq(table.id, "root"),
    });
    const gwConfig = (settings?.gatewayConfig || {}) as any;
    const mem = gwConfig.memory_system || {};

    return (
        <div className="p-8">
            <div className="mb-8">
                <a href="/admin/settings" className="text-sm text-[#F5A524] hover:text-[#FFC24B] mb-2 inline-block">&larr; Back to Settings</a>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-[#F5A524]/10 rounded-lg">
                        <Cog6ToothIcon className="w-6 h-6 text-[#F5A524]" />
                    </div>
                    <h1 className="text-3xl font-bold text-[#EDEDED] tracking-tight">Memory System</h1>
                </div>
                <p className="text-[#8A8A90]">Configure the agent long-term memory and vector search system.</p>
            </div>

            <form action={saveMemorySettings} className="bg-[#0C0C0E] rounded-xl border border-[#242429] overflow-hidden">
                <div className="p-6 space-y-6">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            name="enabled"
                            defaultChecked={mem.enabled !== false}
                            className="w-4 h-4 text-[#F5A524] border-[#242429] rounded focus:ring-[#F5A524]"
                        />
                        <div>
                            <span className="text-sm font-medium text-[#EDEDED]">Enable Memory System</span>
                            <p className="text-xs text-[#8A8A90]">When disabled, agents cannot store or recall memories.</p>
                        </div>
                    </label>

                    <div>
                        <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Embedding Model</label>
                        <select
                            name="embeddingModel"
                            defaultValue={mem.embedding_model || "text-embedding-3-small"}
                            className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm bg-[#101012] text-[#EDEDED]"
                        >
                            <option value="text-embedding-3-small">text-embedding-3-small (1536d, fast)</option>
                            <option value="text-embedding-3-large">text-embedding-3-large (3072d, more accurate)</option>
                        </select>
                        <p className="text-xs text-[#5A5A61] mt-1">Requires OPENAI_API_KEY. Falls back to keyword-only search without it.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Max Memories per Agent</label>
                            <input
                                type="number"
                                name="maxMemories"
                                defaultValue={mem.max_memories_per_agent || 10000}
                                className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm bg-[#101012] text-[#EDEDED]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#B5B5BA] mb-1">Temporal Decay Half-Life (days)</label>
                            <input
                                type="number"
                                name="decayHalfLife"
                                defaultValue={mem.decay_half_life_days || 30}
                                className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm bg-[#101012] text-[#EDEDED]"
                            />
                            <p className="text-xs text-[#5A5A61] mt-1">After this many days, a memory&apos;s relevance score halves.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[#B5B5BA] mb-1">MMR Lambda (0.0-1.0)</label>
                            <input
                                type="number"
                                name="mmrLambda"
                                step="0.1"
                                min="0"
                                max="1"
                                defaultValue={mem.mmr_lambda || 0.7}
                                className="w-full px-3 py-2 border border-[#242429] rounded-lg text-sm bg-[#101012] text-[#EDEDED]"
                            />
                            <p className="text-xs text-[#5A5A61] mt-1">1.0 = pure relevance, 0.0 = max diversity.</p>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <SaveButton label="Save Memory Settings" />
                    </div>
                </div>
            </form>
        </div>
    );
}
