import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { PageHeader } from "../../../components/dashboard/ui";
import BookmarksClient from "./BookmarksClient";
import { getBookmarks, type BookmarkRow } from "./actions";

export const dynamic = "force-dynamic";

export default async function BookmarksPage() {
    const session = await auth();
    if (!session?.user?.tenantId) {
        redirect("/login");
    }

    // Bypass the database request entirely if we are currently compiling in a Docker image
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";

    let bookmarks: BookmarkRow[] = [];

    if (!isNextBuild) {
        bookmarks = await getBookmarks();
    }

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-6xl mx-auto">
            <PageHeader
                title="Bookmarks"
                description="Saved links for you and your agents — web pages and YouTube videos are tagged automatically."
            />
            <BookmarksClient bookmarks={bookmarks} />
        </div>
    );
}
