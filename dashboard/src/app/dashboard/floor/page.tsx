import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import OfficeFrame from "./OfficeFrame";

export const dynamic = "force-dynamic";

/**
 * The Floor — the 3D office.
 *
 * The office is a vendored fork of Hermes3D (office/, MIT) running as its own
 * service and proxied to /office on THIS origin. It is embedded rather than
 * ported because its scene reaches across ~310 files of its own app; framing it
 * keeps it an upgradeable dependency instead of a fork of someone's whole
 * codebase.
 *
 * Same-origin is load-bearing, not cosmetic: the office sends
 * X-Frame-Options: SAMEORIGIN, and it authenticates by forwarding the viewer's
 * dashboard session cookie to /api/office/token — which a cross-origin browser
 * would never send. So there is no second login and nothing to configure.
 */
export default async function FloorPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");

    return <OfficeFrame />;
}
