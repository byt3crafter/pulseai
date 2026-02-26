/**
 * Onboarding Layout — full-screen, no sidebar, no navigation.
 * Users cannot escape until onboarding is complete.
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
