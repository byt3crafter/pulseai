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
        network: ["api.openai.com", "api.telegram.org"],
    },

    // No credentials of its own — uses the tenant's OpenAI provider key.
    credentialSchema: [],

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
