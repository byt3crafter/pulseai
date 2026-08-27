import { auth } from "../../../../auth";
import { redirect } from "next/navigation";
import { listAllWebSessionsAction } from "../actions";
import HistoryClient from "./HistoryClient";

export const dynamic = "force-dynamic";

/**
 * Chat history as a page, not a rail.
 *
 * v4 gives past conversations a full canvas — title, which agent, when — instead
 * of a permanently docked column. The column cost 256px on every screen for
 * something you need a few times a day, and truncated every title to fit.
 */
export default async function AssistantHistoryPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" ||
        process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const session = await auth();
    if (!session?.user) redirect("/login");

    const sessions = await listAllWebSessionsAction();

    return <HistoryClient sessions={sessions} />;
}
