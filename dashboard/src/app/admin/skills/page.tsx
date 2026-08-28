import { requireAdmin } from "../../../utils/admin-auth";
import { redirect } from "next/navigation";
import { listPacks } from "./actions";
import AdminSkillsClient from "./AdminSkillsClient";

export const dynamic = "force-dynamic";

export default async function AdminSkillsPage() {
    const isNextBuild =
        process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";
    if (isNextBuild) return <div>Building Component</div>;

    const adminCheck = await requireAdmin();
    if (!adminCheck.authorized) return redirect("/admin/login");

    return <AdminSkillsClient packs={await listPacks()} />;
}
