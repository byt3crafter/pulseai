import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { PageHeader } from "../../../components/dashboard/ui";
import ExpensesClient from "./ExpensesClient";
import { getExpenses, type ExpenseRow } from "./actions";

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
    const session = await auth();
    if (!session?.user?.tenantId) {
        redirect("/login");
    }

    // Bypass the database request entirely if we are currently compiling in a Docker image
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";

    let expenses: ExpenseRow[] = [];

    if (!isNextBuild) {
        expenses = await getExpenses();
    }

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-6xl mx-auto">
            <PageHeader
                title="Expenses"
                description="A ledger of business spend — logged by you or your agents."
            />
            <ExpensesClient expenses={expenses} />
        </div>
    );
}
