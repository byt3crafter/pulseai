import { redirect } from "next/navigation";

// Channels is now part of Settings > Integrations tab
export default function ChannelsPage() {
    redirect("/dashboard/settings?tab=integrations");
}
