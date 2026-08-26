import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { PageHeader, Card, CardHeader } from "../../../components/dashboard/ui";
import { getBranding } from "../../../utils/branding";
import { getAppVersion } from "../../../utils/version";
import { CREDITS } from "../../../utils/credits";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user?.tenantId) redirect("/login");

    // Branded, so a white-labelled deployment shows the customer's own product
    // name here rather than ours.
    const branding = await getBranding();
    const version = getAppVersion();

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-3xl mx-auto">
            <PageHeader title={`About ${branding.productName}`} description="Version, licences and acknowledgements." />

            <Card>
                <CardHeader title={branding.productName} description="This workspace" />
                <dl className="divide-y divide-pulse-border-subtle">
                    <div className="flex items-center justify-between px-5 py-3">
                        <dt className="text-sm text-pulse-text-soft">Version</dt>
                        <dd className="font-mono text-sm text-pulse-text">{version}</dd>
                    </div>
                    <div className="flex items-center justify-between px-5 py-3">
                        <dt className="text-sm text-pulse-text-soft">Provided by</dt>
                        <dd className="text-sm text-pulse-text">{branding.companyName}</dd>
                    </div>
                    {branding.supportEmail && (
                        <div className="flex items-center justify-between px-5 py-3">
                            <dt className="text-sm text-pulse-text-soft">Support</dt>
                            <dd className="text-sm">
                                <a href={`mailto:${branding.supportEmail}`} className="text-pulse-accent hover:underline">
                                    {branding.supportEmail}
                                </a>
                            </dd>
                        </div>
                    )}
                </dl>
            </Card>

            <div className="mt-5">
                <Card>
                    <CardHeader
                        title="Credits"
                        description="Work by others that this product is built on. Some of these credits are a condition of the licence, not a courtesy."
                    />
                    <ul className="divide-y divide-pulse-border-subtle">
                        {CREDITS.map((c) => (
                            <li key={c.name} className="px-5 py-4">
                                <div className="flex flex-wrap items-baseline gap-x-2">
                                    <span className="text-sm font-medium text-pulse-text">{c.name}</span>
                                    <span className="text-sm text-pulse-muted">by {c.author}</span>
                                    <span className="rounded-full border border-pulse-border-subtle px-2 py-0.5 text-[11px] text-pulse-muted">
                                        {c.licence}
                                    </span>
                                </div>
                                <p className="mt-1 text-sm text-pulse-text-soft">{c.used}</p>
                                {c.url && (
                                    <a
                                        href={c.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-1 inline-block text-xs text-pulse-accent hover:underline"
                                    >
                                        {c.url}
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                </Card>
            </div>
        </div>
    );
}
