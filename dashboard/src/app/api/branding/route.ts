import { NextResponse } from "next/server";
import { getBranding } from "../../../utils/branding";

export const dynamic = "force-dynamic";

/**
 * Public branding, for the pre-login pages.
 *
 * The login screens are the first thing a customer sees, and as a vendor they
 * must carry the customer's brand, not ours. Deliberately narrow: only the
 * three things a login needs (name, logo, accent) and nothing that isn't
 * already visible once you're looking at a branded page. No secrets.
 */
export async function GET() {
    try {
        const b = await getBranding();
        return NextResponse.json({
            productName: b.productName,
            logoDataUrl: b.logoDataUrl,
            accent: b.accent,
        });
    } catch {
        return NextResponse.json({ productName: "Pulse AI", logoDataUrl: null, accent: null });
    }
}
