import { resolvePulseRuntime } from "@/lib/office/pulse-runtime";
import { resolveRuntimeToken } from "@/app/api/runtime/custom/route";

export const runtime = "nodejs";
// Never prerender or cache a stream.
export const dynamic = "force-dynamic";

/**
 * GET /api/runtime/custom/events — the live work stream, piped through.
 *
 * Same seam as the sibling runtime proxy: the browser cannot hold a gateway
 * credential, so it asks this route, which mints a short-lived per-user token
 * from the caller's dashboard session and opens the upstream stream itself.
 * The stream a viewer receives is therefore scoped to that viewer's workspace
 * by the same mechanism as every other office request.
 *
 * The body is passed straight through rather than parsed: these are already
 * the frames the office's event pipeline expects, and re-encoding them here
 * would be one more place for the contract to drift.
 */
export async function GET(request: Request) {
    const pulse = resolvePulseRuntime();
    if (!pulse) {
        return new Response("Runtime not configured.", { status: 503 });
    }

    let token: string;
    try {
        token = await resolveRuntimeToken(request);
    } catch {
        // Not signed in, or the mint refused. The office treats a failed stream
        // as "no live updates" and carries on polling, so this is not fatal.
        return new Response("Unauthorized.", { status: 401 });
    }

    let upstream: Response;
    try {
        upstream = await fetch(`${pulse.url.replace(/\/$/, "")}/events`, {
            headers: {
                Accept: "text/event-stream",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            // The whole point is that it never completes; the default timeout
            // this project puts on fetches must not apply.
            signal: request.signal,
            cache: "no-store",
        });
    } catch {
        return new Response("Upstream unavailable.", { status: 502 });
    }

    if (!upstream.ok || !upstream.body) {
        return new Response("Upstream refused the stream.", { status: upstream.status || 502 });
    }

    return new Response(upstream.body, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    });
}
