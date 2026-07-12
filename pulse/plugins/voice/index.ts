/**
 * Voice Plugin for Pulse AI
 *
 * Transcribe audio → text (Whisper) and speak text → audio (OpenAI TTS,
 * delivered into the chat). Reuses the tenant's OpenAI provider key, so there
 * is no separate credential to configure — just connect OpenAI in Settings →
 * AI Providers and enable this plugin.
 */

import { definePlugin } from "../../src/plugins/sdk/index.js";
import { voiceTranscribeTool, textToSpeechTool } from "./tools.js";

export default definePlugin({
    name: "voice",
    version: "1.0.0",
    description: "Voice — transcribe audio to text (Whisper) and speak replies as audio messages (OpenAI TTS).",
    author: "Runstate",

    permissions: {
        network: ["api.openai.com", "api.elevenlabs.io", "api.telegram.org"],
    },

    // Transcription + OpenAI TTS use the tenant's OpenAI provider key. For
    // premium ElevenLabs voices, add an ElevenLabs key (optional).
    credentialSchema: [
        {
            name: "ELEVENLABS_API_KEY",
            label: "ElevenLabs API Key (optional)",
            type: "secret",
            placeholder: "sk_...",
            required: false,
            helpText: "For premium ElevenLabs voices. Leave blank to use OpenAI TTS (your OpenAI key). When set, ElevenLabs becomes the default voice.",
        },
        {
            name: "ELEVENLABS_VOICE_ID",
            label: "ElevenLabs Voice ID (optional)",
            type: "text",
            placeholder: "21m00Tcm4TlvDq8ikWAM",
            required: false,
            helpText: "The ElevenLabs voice to use. Defaults to a standard voice if blank.",
        },
    ],

    tools: [voiceTranscribeTool, textToSpeechTool],

    routes: [
        {
            method: "GET",
            path: "/status",
            handler: async (_request: any, reply: any) =>
                reply.send({ plugin: "voice", version: "1.0.0", status: "active", tools: ["voice_transcribe", "text_to_speech"] }),
        },
    ],
});
