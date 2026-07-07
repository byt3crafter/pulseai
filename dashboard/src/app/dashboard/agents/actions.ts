"use server";

import { auth } from "../../../auth";
import { db } from "../../../storage/db";
import { agentProfiles, workspaceRevisions, tenantProviderKeys } from "../../../storage/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { initializeWorkspace, WORKSPACE_DEFAULTS } from "../../../utils/workspace";
import { requireTenant } from "../../../utils/tenant-auth";
import { decrypt } from "../../../utils/crypto";
import { PROVIDERS } from "../../../utils/models";
import { stripReasoning } from "../../../utils/strip-reasoning";

/**
 * Generate an agent persona (SOUL / system prompt) using the tenant's own connected
 * model — so a client who doesn't know what to write can just answer a couple of
 * questions and get a polished prompt. Provider-agnostic (Google / OpenAI / Anthropic).
 */
export async function generatePersonaAction(input: {
    name?: string; role: string; company?: string; tone?: string; model?: string;
}): Promise<{ success: boolean; text?: string; message?: string }> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const role = (input.role || "").trim();
    if (!role) return { success: false, message: "First, tell me what this agent should do." };

    const modelId = (input.model || "").trim();
    const providerId = PROVIDERS.find((p) => p.models.some((m) => m.id === modelId))?.id;
    if (!providerId) return { success: false, message: "Pick a model first." };

    const [key] = await db.select().from(tenantProviderKeys)
        .where(and(eq(tenantProviderKeys.tenantId, tenantId), eq(tenantProviderKeys.provider, providerId)))
        .limit(1);
    if (!key) return { success: false, message: `Connect a ${providerId} key in Settings → AI Providers first.` };

    const meta = [
        `Write a first-person system prompt (a "SOUL") for an AI agent working for a business.`,
        `Agent name: ${input.name?.trim() || "the agent"}.`,
        `What it does: ${role}.`,
        input.company?.trim() ? `Company / context: ${input.company.trim()}.` : "",
        `Tone: ${input.tone || "professional"}.`,
        `Write 2–4 short paragraphs covering: who it is, its responsibilities, how it communicates, and what to do when unsure or out of scope.`,
        `Output ONLY the system prompt text — no preamble, no markdown headings, no quotes.`,
    ].filter(Boolean).join("\n");

    try {
        const text = await callProviderForText(providerId, key, modelId, meta);
        if (!text?.trim()) return { success: false, message: "The model returned an empty response — try again." };
        return { success: true, text: stripReasoning(text).trim() };
    } catch (e: any) {
        const m = String(e?.message || "generation failed");
        // Surface provider quota/billing/balance/auth issues clearly (common on free/region-limited/unfunded keys)
        if (/429|402|quota|billing|insufficient|balance|resource_exhausted|free_tier/i.test(m))
            return { success: false, message: "That provider has no available quota/balance — top it up or enable billing, or use a free provider like Groq. (Settings → AI Providers)" };
        if (/401|403|invalid|denied|permission|unauthorized|not supported/i.test(m))
            return { success: false, message: "The provider rejected the key (auth or access restriction). Check it in Settings → AI Providers." };
        return { success: false, message: "Couldn't generate right now — please try again." };
    }
}

/**
 * Full "describe → complete agent" generation. From one plain-English description,
 * the tenant's connected model proposes the whole config: name, soul (system prompt),
 * the best model to use, a fitting department name, and tone. Returns structured JSON.
 */
export async function generateAgentConfigAction(input: { description: string }): Promise<{
    success: boolean;
    config?: { name: string; soul: string; model: string; department: string; tone: string };
    message?: string;
}> {
    const check = await requireTenant();
    if (!check.authorized) return { success: false, message: check.message };
    const tenantId = check.tenantId;

    const description = (input.description || "").trim();
    if (description.length < 8) return { success: false, message: "Describe the agent in a sentence or two so I have enough to work with." };

    // Which providers/models are connected → constrain the model choice to something usable.
    const keys = await db.select({ provider: tenantProviderKeys.provider }).from(tenantProviderKeys).where(eq(tenantProviderKeys.tenantId, tenantId));
    const connected = new Set(keys.map((k) => k.provider));
    const allowedModels = PROVIDERS.filter((p) => connected.has(p.id)).flatMap((p) => p.models.map((m) => m.id));
    if (allowedModels.length === 0) return { success: false, message: "Connect an AI provider in Settings → AI Providers first." };

    // Use the first connected provider/model to run the generation.
    const genModel = allowedModels[0];
    const providerId = PROVIDERS.find((p) => p.models.some((m) => m.id === genModel))!.id;
    const [key] = await db.select().from(tenantProviderKeys)
        .where(and(eq(tenantProviderKeys.tenantId, tenantId), eq(tenantProviderKeys.provider, providerId))).limit(1);
    if (!key) return { success: false, message: "No usable AI provider key found." };

    const prompt = [
        `You are configuring an AI agent for a business, from this description:`,
        `"""${description}"""`,
        ``,
        `Return ONLY a valid JSON object (no markdown, no code fences) with exactly these keys:`,
        `- "name": a short, human friendly agent name (e.g. "Cortex", "Sales Assistant").`,
        `- "soul": a first-person system prompt of 2-4 short paragraphs — who it is, its responsibilities, how it communicates, and what to do when unsure. Plain text, no headings.`,
        `- "model": choose the best fit from EXACTLY this list: ${JSON.stringify(allowedModels)}.`,
        `- "department": a short department name this agent fits (e.g. "Sales", "Support", "Operations").`,
        `- "tone": one word (e.g. "Professional", "Friendly", "Concise").`,
    ].join("\n");

    let raw: string;
    try {
        raw = await callProviderForText(providerId, key, genModel, prompt);
    } catch (e: any) {
        const m = String(e?.message || "");
        if (/429|402|quota|billing|insufficient|balance|resource_exhausted|free_tier/i.test(m))
            return { success: false, message: "That provider has no available quota/balance — top it up, or use a free provider like Groq. (Settings → AI Providers)" };
        if (/401|403|invalid|denied|permission|unauthorized|not supported/i.test(m))
            return { success: false, message: "The provider rejected the key (auth or access restriction). Check Settings → AI Providers." };
        return { success: false, message: "Couldn't generate right now — please try again." };
    }

    // Parse the JSON (strip reasoning + tolerate stray text / code fences around it).
    let parsed: any;
    try {
        const cleaned = stripReasoning(raw);
        const jsonStr = cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1);
        parsed = JSON.parse(jsonStr);
    } catch {
        return { success: false, message: "The model returned an unexpected format — please try again." };
    }

    const model = allowedModels.includes(parsed.model) ? parsed.model : genModel;
    const config = {
        name: stripReasoning(String(parsed.name || "")).slice(0, 120).trim() || "New Agent",
        soul: stripReasoning(String(parsed.soul || "")).trim(),
        model,
        department: String(parsed.department || "").slice(0, 80).trim(),
        tone: String(parsed.tone || "Professional").slice(0, 40).trim(),
    };
    if (!config.soul) return { success: false, message: "Generation was empty — please try again." };
    return { success: true, config };
}


async function callProviderForText(provider: string, key: any, model: string, prompt: string): Promise<string> {
    if (provider === "google") {
        const apiKey = decrypt(key.encryptedApiKey);
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 4000 } }),
        });
        if (!r.ok) throw new Error(`google ${r.status} ${(await r.text()).slice(0, 200)}`);
        const j = await r.json();
        return (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("");
    }
    if (provider === "anthropic") {
        const apiKey = decrypt(key.encryptedApiKey);
        const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
        });
        if (!r.ok) throw new Error(`anthropic ${r.status} ${(await r.text()).slice(0, 200)}`);
        const j = await r.json();
        return (j?.content || []).map((c: any) => c.text || "").join("");
    }
    // OpenAI-compatible providers (OpenAI API-key, Groq, OpenRouter, MiniMax)
    const openaiCompatBase: Record<string, string> = {
        openai: "https://api.openai.com/v1",
        groq: "https://api.groq.com/openai/v1",
        openrouter: "https://openrouter.ai/api/v1",
        minimax: "https://api.minimax.io/v1",
    };
    if (openaiCompatBase[provider]) {
        if (provider === "openai" && (key.authMethod !== "api_key" || !key.encryptedApiKey)) {
            throw new Error("OpenAI is connected via ChatGPT OAuth, which can't be used for generation. Use Groq, Google, or Anthropic, or add an OpenAI API key.");
        }
        const apiKey = decrypt(key.encryptedApiKey);
        const r = await fetch(`${openaiCompatBase[provider]}/chat/completions`, {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.7, max_tokens: 4000 }),
        });
        if (!r.ok) throw new Error(`${provider} ${r.status} ${(await r.text()).slice(0, 200)}`);
        const j = await r.json();
        return j?.choices?.[0]?.message?.content || "";
    }
    throw new Error(`Generation not supported for provider ${provider}.`);
}

export async function createAgentProfileAction(formData: FormData) {
    try {
        const session = await auth();
        if (!session?.user?.tenantId) {
            return { success: false, message: "Unauthorized. No tenant context found." };
        }

        const name = formData.get("name") as string;
        const systemPrompt = formData.get("systemPrompt") as string;
        const modelId = (formData.get("modelId") as string) || "claude-sonnet-4-20250514";
        const dockerSandboxEnabled = formData.get("dockerSandboxEnabled") === "true";
        // Self-config ON by default (agent can refine its own SOUL when you chat with it).
        // Only disabled when the form explicitly sends "false".
        const selfConfigEnabled = formData.get("selfConfigEnabled") !== "false";

        if (!name) {
            return { success: false, message: "Agent name is required." };
        }

        // Insert the agent profile
        const [agent] = await db.insert(agentProfiles).values({
            tenantId: session.user.tenantId,
            name,
            systemPrompt,
            modelId,
            dockerSandboxEnabled,
            selfConfigEnabled,
        }).returning();

        // Initialize workspace directory with seed files
        const workspacePath = await initializeWorkspace(
            session.user.tenantId,
            agent.id,
            systemPrompt || undefined
        );

        // Record initial revisions in DB for all workspace files
        const tenantId = session.user.tenantId;
        const userId = session.user.id;
        const files = { ...WORKSPACE_DEFAULTS };
        if (systemPrompt) {
            files["SOUL.md"] = systemPrompt;
        }

        await db.insert(workspaceRevisions).values(
            Object.entries(files).map(([fileName, content]) => ({
                agentProfileId: agent.id,
                tenantId,
                fileName,
                content,
                changeSummary: "Initial workspace creation",
                changedBy: userId,
                revisionNumber: 1,
            }))
        );

        // Update agent with workspace path
        await db.update(agentProfiles)
            .set({ workspacePath, updatedAt: new Date() })
            .where(eq(agentProfiles.id, agent.id));

        revalidatePath("/dashboard/agents");
        return { success: true, message: "Agent Profile created successfully." };
    } catch (error) {
        console.error("Failed to create agent profile:", error);
        return { success: false, message: "An error occurred while creating the profile." };
    }
}

// ── Live model list ───────────────────────────────────────────────────────
// Pull the models a provider ACTUALLY offers (so new releases like MiniMax-M3
// show up without a code change), for OpenAI-compatible providers. Falls back
// to the static catalog for other providers or on any error. Merges live IDs
// with static display names/categories where known.
const OPENAI_COMPAT_MODEL_BASE: Record<string, string> = {
    openai: "https://api.openai.com/v1",
    groq: "https://api.groq.com/openai/v1",
    openrouter: "https://openrouter.ai/api/v1",
    minimax: "https://api.minimax.io/v1",
};

export async function getLiveModelsAction(
    providerId: string,
): Promise<{ id: string; provider: string; displayName: string; category: string }[]> {
    const tc = await requireTenant();
    const staticModels = (PROVIDERS.find((p) => p.id === providerId)?.models || []) as any[];
    if (!tc.authorized) return staticModels;

    const base = OPENAI_COMPAT_MODEL_BASE[providerId];
    if (!base) return staticModels; // anthropic/google etc. keep the curated list

    try {
        const [row] = await db.select({ enc: tenantProviderKeys.encryptedApiKey })
            .from(tenantProviderKeys)
            .where(and(
                eq(tenantProviderKeys.tenantId, tc.tenantId),
                eq(tenantProviderKeys.provider, providerId),
                eq(tenantProviderKeys.isActive, true),
                eq(tenantProviderKeys.authMethod, "api_key"),
            )).limit(1);
        if (!row?.enc) return staticModels;

        const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${decrypt(row.enc)}` } });
        if (!r.ok) return staticModels;
        const j = await r.json();
        const ids: string[] = (j?.data || []).map((m: any) => m?.id).filter((x: any) => typeof x === "string");
        if (!ids.length) return staticModels;

        const byId = new Map(staticModels.map((m) => [m.id, m]));
        // Preserve the provider's own ordering (newest first for MiniMax).
        return ids.map((id) => byId.get(id) || { id, provider: providerId, displayName: id, category: "flagship" });
    } catch (e) {
        console.error("getLiveModelsAction failed:", e);
        return staticModels;
    }
}
