import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { PageHeader } from "../../../components/dashboard/ui";
import NotesClient from "./NotesClient";
import { getNotes, type NoteRow } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
    const session = await auth();
    if (!session?.user?.tenantId) {
        redirect("/login");
    }

    // Bypass the database request entirely if we are currently compiling in a Docker image
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";

    let notes: NoteRow[] = [];

    if (!isNextBuild) {
        notes = await getNotes();
    }

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-[1060px] mx-auto">
            <PageHeader
                title="Notepad"
                description="Quick notes for you and your agents — pin the ones you want to keep on top."
            />
            <NotesClient notes={notes} />
        </div>
    );
}
