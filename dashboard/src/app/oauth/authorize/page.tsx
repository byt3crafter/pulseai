import { auth } from "../../../auth";
import { db } from "../../../storage/db";
import { oauthClients, tenants } from "../../../storage/schema";
import { eq, and } from "drizzle-orm";
import ConsentClient from "./ConsentClient";
import { redirect } from "next/navigation";

export default async function OAuthAuthorizePage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const session = await auth();
    const resolvedParams = await searchParams;

    if (!session?.user?.tenantId) {
        redirect("/login?callbackUrl=" + encodeURIComponent("/oauth/authorize?" + new URLSearchParams(resolvedParams as Record<string, string>).toString()));
    }

    const clientId = resolvedParams.client_id;
    const redirectUri = resolvedParams.redirect_uri || "";
    const state = resolvedParams.state;
    const codeChallenge = resolvedParams.code_challenge;
    const codeChallengeMethod = resolvedParams.code_challenge_method;
    const responseType = resolvedParams.response_type;

    // "mode=connect" means this was initiated from the dashboard itself
    const isDashboardFlow = resolvedParams.mode === "connect";

    // For dashboard-initiated flows, client_id might be auto-created
    // For external CLI flows, client_id is required
    if (!clientId && !isDashboardFlow) {
        return <ErrorPage message="Missing client_id parameter." />;
    }

    if (responseType && responseType !== "code") {
        return <ErrorPage message={`Unsupported response_type: ${responseType}. Only "code" is supported.`} />;
    }

    // Look up the client (if clientId provided)
    let clientName = "Pulse Dashboard";
    if (clientId) {
        const client = await db.query.oauthClients.findFirst({
            where: eq(oauthClients.clientId, clientId),
        });

        if (!client) {
            return <ErrorPage message="Unknown application. The client_id is not registered." />;
        }
        clientName = client.name;
    }

    // Check if CLI access is enabled
    const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, session.user.tenantId),
    });

    const tenantConfig = (tenant?.config as Record<string, any>) || {};
    const cliEnabled = tenantConfig.enable_third_party_cli ?? false;

    return (
        <ConsentClient
            clientName={clientName}
            clientId={clientId || ""}
            redirectUri={redirectUri}
            state={state}
            codeChallenge={codeChallenge}
            codeChallengeMethod={codeChallengeMethod}
            cliEnabled={cliEnabled}
            userName={session.user.name ?? session.user.email ?? "User"}
            tenantName={tenant?.name ?? "your workspace"}
            isDashboardFlow={isDashboardFlow}
        />
    );
}

function ErrorPage({ message }: { message: string }) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="bg-white border border-red-200 rounded-xl p-8 max-w-md text-center shadow-sm">
                <div className="text-3xl mb-4">&#9888;</div>
                <h1 className="text-lg font-bold text-slate-900 mb-2">Authorization Error</h1>
                <p className="text-sm text-slate-600">{message}</p>
            </div>
        </div>
    );
}
