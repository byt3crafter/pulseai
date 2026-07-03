import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { db } from "../../../storage/db";
import { tenants, tenantProviderKeys } from "../../../storage/schema";
import { and, eq } from "drizzle-orm";
import ChatGptClient from "./ChatGptClient";

export const dynamic = "force-dynamic";

export default async function ChatGptPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");
    const tenantId = session.user.tenantId;

    const [t] = await db.select({ config: tenants.config }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const enabled = !!(t?.config as any)?.chatgptConnectEnabled;

    let connected = false;
    let accountId: string | null = null;
    let expiresAt: string | null = null;
    if (enabled) {
        const [row] = await db.select({ alias: tenantProviderKeys.keyAlias, exp: tenantProviderKeys.oauthTokenExpiresAt, active: tenantProviderKeys.isActive })
            .from(tenantProviderKeys)
            .where(and(eq(tenantProviderKeys.tenantId, tenantId), eq(tenantProviderKeys.provider, "chatgpt")))
            .limit(1);
        if (row?.active) {
            connected = true;
            accountId = row.alias;
            expiresAt = row.exp ? new Date(row.exp).toISOString() : null;
        }
    }

    return <ChatGptClient enabled={enabled} connected={connected} accountId={accountId} expiresAt={expiresAt} />;
}
