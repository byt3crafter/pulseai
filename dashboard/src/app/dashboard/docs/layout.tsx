import DocsSidebar from "./DocsSidebar";

/**
 * Docs sit inside the dashboard shell (the app nav is already on the left), so
 * this layout only adds the docs section rail beside the page — using the same
 * page padding as every other dashboard page.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <div className="mx-auto flex max-w-7xl gap-8">
                <DocsSidebar />
                <div className="min-w-0 flex-1">{children}</div>
            </div>
        </div>
    );
}
