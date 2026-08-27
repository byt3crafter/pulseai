import type { EventFrame, GatewayClient } from "@/lib/gateway/GatewayClient";

/**
 * PULSE PATCH: the office's live feed of work started anywhere in Pulse.
 *
 * The custom runtime adapter is HTTP request/response — its connect() is a
 * /health probe and no socket is ever opened — so the office's only source of
 * "this agent is working" was its own outgoing chat. A job given from the
 * dashboard, Telegram, a schedule or a commitment was invisible: the floor sat
 * at "0 working" for the entire run.
 *
 * Pulse emits every run into its floor bus regardless of trigger, and serves
 * that as SSE. The frames arrive already shaped as gateway events, so they are
 * pushed straight into the client's event pipeline and the office's existing
 * animation logic picks them up unchanged.
 *
 * Uses fetch rather than EventSource on purpose: fetch goes through the
 * base-path wrapper installed in the root layout (EventSource does not), and it
 * takes an AbortSignal, so a disconnect actually closes the upstream stream.
 */
export function startPulseEventStream(client: GatewayClient): () => void {
    const controller = new AbortController();
    let stopped = false;
    // Backoff so a runtime that is down is not hammered; reset on every
    // successful read so a long-lived stream that drops reconnects promptly.
    let delayMs = 1_000;

    const run = async () => {
        while (!stopped) {
            try {
                const res = await fetch("/api/runtime/custom/events", {
                    headers: { Accept: "text/event-stream" },
                    signal: controller.signal,
                    cache: "no-store",
                });
                if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);

                delayMs = 1_000;
                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                while (!stopped) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });

                    // SSE frames are separated by a blank line. Keep the tail:
                    // a chunk boundary can land mid-frame.
                    let split = buffer.indexOf("\n\n");
                    while (split !== -1) {
                        const raw = buffer.slice(0, split);
                        buffer = buffer.slice(split + 2);
                        split = buffer.indexOf("\n\n");

                        const data = raw
                            .split("\n")
                            .filter((line) => line.startsWith("data:"))
                            .map((line) => line.slice(5).trim())
                            .join("\n");
                        if (!data) continue; // heartbeat comment

                        try {
                            const frame = JSON.parse(data) as EventFrame;
                            if (frame && frame.type === "event") client.emitLocalEvent(frame);
                        } catch {
                            /* a malformed frame is not worth dropping the stream for */
                        }
                    }
                }
            } catch {
                if (stopped) return;
            }
            if (stopped) return;
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            delayMs = Math.min(delayMs * 2, 30_000);
        }
    };

    void run();

    return () => {
        stopped = true;
        controller.abort();
    };
}
