import { redirect } from "next/navigation";

// Billing is now part of Settings > Billing tab
export default function BillingPage() {
    redirect("/dashboard/settings?tab=billing");
}
