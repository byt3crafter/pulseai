/**
 * Onboarding Layout — bypasses the dashboard sidebar.
 * Renders full-page so the wizard doesn't float over the nav.
 */
export default function OnboardingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
            {children}
        </div>
    );
}
