import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import { PageHeader } from "../../../components/dashboard/ui";
import ContactsClient from "./ContactsClient";
import { getContacts, getContactsSource, type ContactRow, type ContactsSource } from "./actions";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
    const session = await auth();
    if (!session?.user?.tenantId) {
        redirect("/login");
    }

    // Bypass the database request entirely if we are currently compiling in a Docker image
    const isNextBuild = process.env.npm_lifecycle_event === "build" || process.env.NEXT_PHASE === "phase-production-build";

    let contacts: ContactRow[] = [];
    let source: ContactsSource = "auto";

    if (!isNextBuild) {
        contacts = await getContacts();
        source = await getContactsSource();
    }

    return (
        <div className="p-4 sm:p-5 lg:p-6 max-w-page mx-auto">
            <PageHeader
                title="Contacts"
                description="Your address book — the assistant uses this to look people up when you say 'email <name>'."
            />
            <ContactsClient contacts={contacts} source={source} />
        </div>
    );
}
