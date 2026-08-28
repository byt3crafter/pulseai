import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { PageHeader } from "../../../components/dashboard/ui";
import TodosClient from "./TodosClient";
import { getTodos, type TodoRow } from "./actions";

export const dynamic = "force-dynamic";

export default async function TodosPage() {
    const session = await auth();
    if (!session?.user?.tenantId) {
        redirect("/login");
    }

    // Bypass the database request entirely if we are currently compiling in a Docker image
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";

    let todos: TodoRow[] = [];

    if (!isNextBuild) {
        todos = await getTodos();
    }

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-page mx-auto">
            <PageHeader
                title="To-dos"
                description="A lightweight task list for you and your agents to track."
            />
            <TodosClient todos={todos} />
        </div>
    );
}
