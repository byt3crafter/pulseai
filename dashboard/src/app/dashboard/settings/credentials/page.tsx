import { redirect } from "next/navigation";

// Credentials now live inside the unified Settings tab shell
// (/dashboard/settings?tab=credentials). This route is kept only to redirect
// old links so nothing 404s.
export default function CredentialsPage() {
    redirect("/dashboard/settings?tab=credentials");
}
