import { auth } from "../../auth";
import { db } from "../../storage/db";
import { users, tenants, globalSettings } from "../../storage/schema";
import { eq } from "drizzle-orm";
import SidebarUserMenu from "../../components/SidebarUserMenu";
import DashboardNav from "../../components/DashboardNav";
import DashboardShell from "../../components/DashboardShell";
import { accentOverrideCss } from "../../utils/accent";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    const tenantId = session?.user?.tenantId;
    const userId = session?.user?.id;

    // Fetch real workspace name and user name
    const [tenantRow, userRow] = await Promise.all([
        tenantId ? db.select({ name: tenants.name, config: tenants.config }).from(tenants).where(eq(tenants.id, tenantId)).limit(1) : Promise.resolve([]),
        userId ? db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1) : Promise.resolve([]),
    ]);

    // Per-tenant white-label branding (Settings → Appearance): title, logo, accent.
    const branding = ((tenantRow[0] as any)?.config?.branding ?? {}) as { title?: string; logo?: string; accent?: string };
    const workspaceName = (branding.title && branding.title.trim()) || tenantRow[0]?.name || "Workspace";
    const accentCss = accentOverrideCss(branding.accent);
    const userName = userRow[0]?.name ?? userRow[0]?.email ?? "User";
    const initials = userName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
    const isAdmin = session?.user?.role === "ADMIN";
    const chatgptConnect = !!(tenantRow[0] as any)?.config?.chatgptConnectEnabled;
    const rootRow = await db.select({ config: globalSettings.config }).from(globalSettings).where(eq(globalSettings.id, "root")).limit(1);
    const showBilling = ((rootRow[0]?.config as any)?.billingMode ?? "credits") !== "unlimited";

    return (
        <>
            {accentCss && <style dangerouslySetInnerHTML={{ __html: accentCss }} />}
            <DashboardShell
                logo={branding.logo}
                workspaceName={workspaceName}
                nav={<DashboardNav isAdmin={isAdmin} chatgptConnect={chatgptConnect} showBilling={showBilling} />}
            userMenu={
                <SidebarUserMenu
                    name={userName}
                    email={userRow[0]?.email ?? undefined}
                    role={isAdmin ? "Administrator" : "Workspace Member"}
                    initials={initials}
                    callbackUrl="/login"
                    variant="pulse"
                    settingsHref="/dashboard/settings?tab=account"
                />
            }
            >
                {children}
            </DashboardShell>
        </>
    );
}
