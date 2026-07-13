import DocsSidebar from "./DocsSidebar";

/**
 * Docs live inside the dashboard shell (left app nav is already there), so this
 * layout only adds the docs section rail next to the page content.
 */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex gap-10">
            <DocsSidebar />
            <div className="min-w-0 flex-1">{children}</div>
        </div>
    );
}
