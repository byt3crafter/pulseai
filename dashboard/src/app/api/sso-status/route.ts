import { NextResponse } from "next/server";
import { ssoStatus } from "../../../utils/sso";

export const dynamic = "force-dynamic";

/** Public: whether SSO is enabled + its button label. No secrets. */
export async function GET() {
    try {
        const status = await ssoStatus();
        return NextResponse.json(status);
    } catch {
        return NextResponse.json({ enabled: false, name: "SSO" });
    }
}
