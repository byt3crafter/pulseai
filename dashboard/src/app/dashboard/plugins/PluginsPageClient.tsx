"use client";

import { PageHeader } from "../../../components/dashboard/ui";
import { PluginsTab, type PluginData } from "../settings/SettingsClient";

interface Props {
    plugins: PluginData[];
    savePluginCredentials: (formData: FormData) => Promise<void>;
    toolSearchConfig: { mode: "off" | "auto" | "on"; threshold: number; maxResults: number };
    initialPlugin: string | null;
}

export default function PluginsPageClient({ plugins, savePluginCredentials, toolSearchConfig, initialPlugin }: Props) {
    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <PageHeader title="Plugins" description="Pick an integration to configure — its credentials are stored in your vault." />
            <div className="mt-6" />
            <PluginsTab
                plugins={plugins}
                savePluginCredentials={savePluginCredentials}
                toolSearchConfig={toolSearchConfig}
                initialPlugin={initialPlugin}
            />
        </div>
    );
}
