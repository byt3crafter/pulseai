import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { PageHeader } from "../../../components/dashboard/ui";
import WorkClient from "./WorkClient";
import { getTasks, type TaskRow } from "./actions";

export const dynamic = "force-dynamic";

export default async function WorkPage() {
    const session = await auth();
    if (!session?.user?.tenantId) {
        redirect("/login");
    }

    // Bypass the database request entirely if we are currently compiling in a Docker image
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";

    let tasks: TaskRow[] = [];

    if (!isNextBuild) {
        tasks = await getTasks();
    }

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-[1060px] mx-auto">
            <PageHeader
                title="Tasks & Projects"
                description="A work board for you and your agents — track what's in flight and what's done."
            />
            <WorkClient tasks={tasks} />
        </div>
    );
}
