import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { PageHeader } from "../../../components/dashboard/ui";
import LoginsClient from "./LoginsClient";
import { getLogins, type LoginRow } from "./actions";
import { getTenantAgents } from "../settings/credentials/actions";

export const dynamic = "force-dynamic";

export default async function LoginsPage() {
    const session = await auth();
    if (!session?.user?.tenantId) {
        redirect("/login");
    }

    // Bypass the database request entirely if we are currently compiling in a Docker image
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";

    const tenantId = (session!.user as any).tenantId as string;

    let logins: LoginRow[] = [];
    let agents: { id: string; name: string }[] = [];

    if (!isNextBuild) {
        logins = await getLogins();
        agents = await getTenantAgents(tenantId);
    }

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-page mx-auto">
            <PageHeader
                title="Passwords"
                description="Saved website logins. Your agents can use these to sign in on your behalf — they never see the actual passwords."
            />
            <LoginsClient logins={logins} agents={agents} />
        </div>
    );
}
