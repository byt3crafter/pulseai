import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "../../../../auth";
import { db } from "../../../../storage/db";
import { credentials, tenantProviderKeys } from "../../../../storage/schema";
import { decrypt } from "../../../../utils/crypto";

export const runtime = "nodejs";

/**
 * Speech-to-text for the assistant composer's mic button. Tenant enables
 * voice by adding an ElevenLabs key (Settings → Credentials, name
 * ELEVENLABS_API_KEY); if absent, falls back to the tenant's OpenAI provider
 * key (Whisper). Neither key ever leaves this handler — only the transcript
 * or a generic error goes back to the client.
 */
export async function POST(req: NextRequest) {
    const session = await auth();
    const tenantId = (session?.user as any)?.tenantId as string | undefined;
    if (!session?.user || !tenantId) {
        return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    let file: File | null = null;
    try {
        const form = await req.formData();
        const f = form.get("audio");
        if (f instanceof File) file = f;
    } catch {
        return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (!file) {
        return NextResponse.json({ error: "No audio provided." }, { status: 400 });
    }

    try {
        const [elevenRow] = await db
            .select({ enc: credentials.encryptedValue })
            .from(credentials)
            .where(and(eq(credentials.tenantId, tenantId), eq(credentials.name, "ELEVENLABS_API_KEY")))
            .limit(1);

        if (elevenRow?.enc) {
            const apiKey = decrypt(elevenRow.enc);
            const upstream = new FormData();
            upstream.append("file", file, "audio.webm");
            upstream.append("model_id", "scribe_v1");

            const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
                method: "POST",
                headers: { "xi-api-key": apiKey },
                body: upstream,
            });
            if (!r.ok) throw new Error("elevenlabs_failed");
            const json = await r.json();
            const text = typeof json?.text === "string" ? json.text : "";
            return NextResponse.json({ text });
        }

        const [openaiRow] = await db
            .select({ enc: tenantProviderKeys.encryptedApiKey })
            .from(tenantProviderKeys)
            .where(and(
                eq(tenantProviderKeys.tenantId, tenantId),
                eq(tenantProviderKeys.provider, "openai"),
                eq(tenantProviderKeys.isActive, true),
            ))
            .limit(1);

        if (openaiRow?.enc) {
            const apiKey = decrypt(openaiRow.enc);
            const upstream = new FormData();
            upstream.append("file", file, "audio.webm");
            upstream.append("model", "whisper-1");

            const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}` },
                body: upstream,
            });
            if (!r.ok) throw new Error("openai_failed");
            const json = await r.json();
            const text = typeof json?.text === "string" ? json.text : "";
            return NextResponse.json({ text });
        }

        return NextResponse.json(
            { error: "Voice isn't set up — add an ElevenLabs or OpenAI key in Settings." },
            { status: 400 },
        );
    } catch (error) {
        console.error("Voice transcription failed:", error);
        return NextResponse.json({ error: "Couldn't transcribe the audio." }, { status: 502 });
    }
}
