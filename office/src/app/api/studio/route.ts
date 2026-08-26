import { NextResponse } from "next/server";

import {
  sanitizeStudioGatewaySettings,
  sanitizeStudioSettings,
  type StudioSettingsPatch,
} from "@/lib/studio/settings";
import {
  applyStudioSettingsPatch,
  loadLocalGatewayDefaults,
  loadStudioSettings,
} from "@/lib/studio/settings-store";
import { resolvePulseRuntime } from "@/lib/office/pulse-runtime";

export const runtime = "nodejs";

const isPatch = (value: unknown): value is StudioSettingsPatch =>
  Boolean(value && typeof value === "object");

export async function GET() {
  try {
    const settings = loadStudioSettings();
    const localGatewayDefaults = loadLocalGatewayDefaults();
    return NextResponse.json(
      {
        settings: sanitizeStudioSettings(settings),
        localGatewayDefaults: sanitizeStudioGatewaySettings(localGatewayDefaults),
        // gatewayPrivate and localGatewayDefaultsPrivate are intentionally omitted.
        // Upstream tokens must not cross the browser API boundary — the Studio proxy
        // (server/gateway-proxy.js) injects the server-side token into connect frames.
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load studio settings.";
    console.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const rawBody = await request.text();
    if (!rawBody.trim()) {
      return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });
    }
    const body = JSON.parse(rawBody) as unknown;
    if (!isPatch(body)) {
      return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });
    }

    // PULSE PATCH: nobody gets to move this deployment off Pulse.
    //
    // This route has no auth on either verb, and it is reachable from the
    // internet through the dashboard's origin — so an unauthenticated PUT could
    // rewrite the one shared, server-side settings.json and repoint every
    // viewer at a runtime of the caller's choosing. Even authenticated, a stale
    // client replaying an old selection would do the same by accident.
    //
    // The runtime comes from env and is not negotiable, so gateway fields are
    // dropped from the patch rather than trusted. Everything else — layout,
    // preferences — still saves normally.
    const patch = { ...body } as StudioSettingsPatch & { gateway?: unknown };
    if (resolvePulseRuntime()) delete patch.gateway;

    const settings = applyStudioSettingsPatch(patch);
    return NextResponse.json(
      {
        settings: sanitizeStudioSettings(settings),
        localGatewayDefaults: sanitizeStudioGatewaySettings(loadLocalGatewayDefaults()),
        // gatewayPrivate intentionally omitted — see GET handler comment.
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save studio settings.";
    console.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
