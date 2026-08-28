import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { PageHeader } from "../../../components/dashboard/ui";
import CalendarClient from "./CalendarClient";
import { getEvents, getTimezone, type EventRow } from "./actions";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
    const session = await auth();
    if (!session?.user?.tenantId) {
        redirect("/login");
    }

    // Bypass the database request entirely if we are currently compiling in a Docker image
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";

    let eventRows: EventRow[] = [];
    let timezone = "UTC";

    if (!isNextBuild) {
        eventRows = await getEvents();
        timezone = await getTimezone();
    }

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-page mx-auto">
            <PageHeader
                title="Calendar"
                description="Your schedule — meetings and events. The assistant can read and add to this."
            />
            <CalendarClient events={eventRows} timezone={timezone} />
        </div>
    );
}
