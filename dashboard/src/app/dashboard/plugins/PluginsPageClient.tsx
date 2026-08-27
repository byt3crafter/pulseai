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
        <div className="mx-auto w-full max-w-[1060px] px-6 py-7 sm:px-10 sm:py-9">
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
