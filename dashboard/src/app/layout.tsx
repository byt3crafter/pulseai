import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
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
            correct theme is applied before React hydrates. Falls back to the
            OS preference, then to dark (the CSS default in globals.css). */}
        <Script id="pulse-theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('pulse-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();`}
        </Script>
        {children}
      </body>
    </html>
  );
}
