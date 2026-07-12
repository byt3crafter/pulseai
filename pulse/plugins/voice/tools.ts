/**
 * Voice tools — transcription (OpenAI Whisper) and text-to-speech (OpenAI TTS).
 * Reuses the tenant's existing OpenAI provider key (no separate credential).
 * TTS audio is saved to the agent workspace and delivered into the chat
 * (Telegram) via the shared channel-delivery helper.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Tool } from "../../src/agent/tools/tool.interface.js";
import { config } from "../../src/config.js";
import { providerKeyService } from "../../src/agent/providers/provider-key-service.js";
import { credentialVault } from "../../src/agent/tools/credential-vault.js";
import { sendFileToConversation } from "../../src/utils/channel-delivery.js";
import { logger } from "../../src/utils/logger.js";

// Default ElevenLabs voice ("Rachel") when none is configured.
const DEFAULT_ELEVENLABS_VOICE = "21m00Tcm4TlvDq8ikWAM";

const TIMEOUT_MS = 60_000;
const TTS_VOICES = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]);
const NO_KEY = "Voice isn't configured — connect an OpenAI key in Settings → AI Providers.";

async function openaiKey(tenantId: string): Promise<string | null> {
    const r = await providerKeyService.resolveKey(tenantId, "openai");
    return r?.key || null;
}

export const voiceTranscribeTool: Tool = {
    name: "voice_transcribe",
    description:
        "Transcribe spoken audio to text (OpenAI Whisper). Give an audio_url or audio_base64 — a voice note, " +
        "recording, or call clip. Returns the transcript so you can act on what was said.",
    parameters: {
        type: "object",
        properties: {
            audio_url: { type: "string", description: "URL of an audio file (mp3, m4a, ogg, wav, webm)." },
            audio_base64: { type: "string", description: "Base64 audio content (alternative to audio_url)." },
            filename: { type: "string", description: "Optional filename hint, e.g. 'note.ogg' (helps format detection)." },
        },
        required: [],
    },
    async execute({ tenantId, args }) {
        const key = await openaiKey(tenantId);
        if (!key) return { result: NO_KEY };

        let bytes: Buffer;
        try {
            if (args.audio_base64) {
                bytes = Buffer.from(String(args.audio_base64), "base64");
            } else if (args.audio_url) {
                const r = await fetch(String(args.audio_url), { signal: AbortSignal.timeout(TIMEOUT_MS) });
                if (!r.ok) return { result: `Couldn't fetch the audio (HTTP ${r.status}).` };
                bytes = Buffer.from(await r.arrayBuffer());
            } else {
                return { result: "Provide audio_url or audio_base64." };
            }
        } catch (e: any) {
            return { result: `Couldn't read the audio: ${e.message}` };
        }
        if (bytes.length > 25 * 1024 * 1024) return { result: "Audio too large (max 25 MB)." };

        try {
            const form = new FormData();
            form.append("file", new Blob([new Uint8Array(bytes)]), String(args.filename || "audio.mp3"));
            form.append("model", "whisper-1");
            const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
                method: "POST",
                headers: { Authorization: `Bearer ${key}` },
                body: form,
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            const j: any = await res.json().catch(() => ({}));
            if (!res.ok) return { result: `Transcription failed (${res.status}): ${j?.error?.message || res.statusText}` };
            return { result: JSON.stringify({ text: j.text }), metadata: { chars: (j.text || "").length } };
        } catch (e: any) {
            logger.error({ err: e }, "voice_transcribe failed");
            return { result: `Transcription failed: ${e.message}` };
        }
    },
};

export const textToSpeechTool: Tool = {
    name: "text_to_speech",
    description:
        "Convert text to a spoken audio message (OpenAI TTS) and send it into the user's chat when the channel " +
        "supports audio (Telegram); otherwise it's saved to your workspace. Use for a voice reply.",
    parameters: {
        type: "object",
        properties: {
            text: { type: "string", description: "The text to speak (max ~4000 characters)." },
            provider: { type: "string", description: "'elevenlabs' (premium, if configured) or 'openai'. Defaults to ElevenLabs when its key is set, else OpenAI." },
            voice: { type: "string", description: "OpenAI voice: alloy (default), echo, fable, onyx, nova, shimmer." },
            voice_id: { type: "string", description: "ElevenLabs voice ID (overrides the configured default)." },
        },
        required: ["text"],
    },
    async execute({ tenantId, conversationId, args }) {
        const text = String(args.text || "").trim();
        if (!text) return { result: "Provide text to speak." };
        if (text.length > 4096) return { result: "Text too long for one clip (max 4096 characters)." };

        const env = await credentialVault.getEnvVars(tenantId, (args as any)._agentId);
        const elKey = env["ELEVENLABS_API_KEY"];
        const provider = (String(args.provider || "").toLowerCase()
            || (env["TTS_PROVIDER"] || "").toLowerCase()
            || (elKey ? "elevenlabs" : "openai"));

        try {
            let buf: Buffer;
            if (provider === "elevenlabs") {
                if (!elKey) return { result: "ElevenLabs isn't configured — add an ELEVENLABS_API_KEY credential, or use provider 'openai'." };
                const voiceId = String(args.voice_id || env["ELEVENLABS_VOICE_ID"] || DEFAULT_ELEVENLABS_VOICE);
                const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
                    method: "POST",
                    headers: { "xi-api-key": elKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
                    body: JSON.stringify({ text, model_id: env["ELEVENLABS_MODEL"] || "eleven_multilingual_v2" }),
                    signal: AbortSignal.timeout(TIMEOUT_MS),
                });
                if (!res.ok) {
                    const t = await res.text().catch(() => "");
                    return { result: `ElevenLabs speech failed (${res.status}): ${t.slice(0, 200) || res.statusText}` };
                }
                buf = Buffer.from(await res.arrayBuffer());
            } else {
                const key = await openaiKey(tenantId);
                if (!key) return { result: NO_KEY };
                const voice = TTS_VOICES.has(String(args.voice)) ? String(args.voice) : "alloy";
                const res = await fetch("https://api.openai.com/v1/audio/speech", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ model: "tts-1", voice, input: text, response_format: "mp3" }),
                    signal: AbortSignal.timeout(TIMEOUT_MS),
                });
                if (!res.ok) {
                    const j: any = await res.json().catch(() => ({}));
                    return { result: `Speech generation failed (${res.status}): ${j?.error?.message || res.statusText}` };
                }
                buf = Buffer.from(await res.arrayBuffer());
            }

            const agentId = (args._agentId as string) || conversationId || "agent";
            const dir = join(config.WORKSPACE_BASE_DIR, tenantId, agentId, "audio");
            await mkdir(dir, { recursive: true });
            const filePath = join(dir, `tts-${Date.now()}.mp3`);
            await writeFile(filePath, buf);

            const delivery = await sendFileToConversation(tenantId, conversationId, filePath, "");
            return {
                result: JSON.stringify({
                    bytes: buf.length,
                    provider,
                    delivered: delivery.delivered,
                    note: delivery.delivered
                        ? "voice message sent to the user's chat — tell them it's in this chat, don't paste the file path"
                        : "saved to your workspace (this channel can't play audio inline)",
                }),
            };
        } catch (e: any) {
            logger.error({ err: e }, "text_to_speech failed");
            return { result: `Speech generation failed: ${e.message}` };
        }
    },
};
