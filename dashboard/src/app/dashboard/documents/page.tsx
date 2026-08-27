import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { PageHeader } from "../../../components/dashboard/ui";
import DocumentsClient from "./DocumentsClient";
import { getDocuments, type DocumentRow } from "./actions";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
    const session = await auth();
    if (!session?.user?.tenantId) {
        redirect("/login");
    }

    // Bypass the database request entirely if we are currently compiling in a Docker image
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";

    let documents: DocumentRow[] = [];

    if (!isNextBuild) {
        documents = await getDocuments();
    }

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-[1060px] mx-auto">
            <PageHeader
                title="Documents"
                description="Your file locker — upload contracts, quotes, and receipts so you and your agents can find and read them later."
            />
            <DocumentsClient documents={documents} />
        </div>
    );
}
