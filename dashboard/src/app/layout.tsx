import type { Metadata, Viewport } from "next";
import { Roboto_Mono } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";

// UI face — Google Sans, the face the v4 Studio design actually specifies.
// Google does not serve it from fonts.googleapis.com, so it is self-hosted
// here under its SIL Open Font License (see GoogleSans-OFL.txt alongside).
//
// The shipped file is the variable font subset to Latin and compressed to
// woff2: 4.7 MB of TTF becomes 86 KB. That matters more than usual here —
// this deployment's edge has served an 8 KB page in 29 seconds, so a
// multi-megabyte font would have been felt on every first load.
//
// Kept on the historical `--font-geist-sans` variable so every consumer across
// the app picks it up without being touched.
const geistSans = localFont({
  src: "./fonts/GoogleSans-latin.woff2",
  variable: "--font-geist-sans",
  display: "swap",
  weight: "400 700",
  fallback: ["Roboto", "system-ui", "sans-serif"],
});

const geistMono = Roboto_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "600"],
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
