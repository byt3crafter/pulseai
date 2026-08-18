import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// UI face — Inter: the humanist grotesque the clean-SaaS look is built on.
// Kept on the existing `--font-geist-sans` CSS variable so nothing else has to
// change; the variable name is historical, the face is Inter.
const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pulse — Your own agentic AI workforce",
  description: "Pulse turns AI into an organized team of agents that work for you — from one person to a whole enterprise. Managers and specialists that use your own tools and act on your behalf, in your own private app.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0A0A0C",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Anti-FOUC: sets data-theme on <html> before first paint, so the
            correct theme is applied before React hydrates. Honors the user's
            saved choice; otherwise defaults to light (the product default). */}
        <Script id="pulse-theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('pulse-theme');if(t!=='light'&&t!=='dark'){t='light';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();`}
        </Script>
        {children}
      </body>
    </html>
  );
}
