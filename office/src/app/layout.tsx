import type { Metadata } from "next";
import { Bebas_Neue, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hermes3D",
  description: "Focused operator studio for the Hermes gateway.",
};

const display = Bebas_Neue({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          PULSE PATCH: prefix same-origin /api calls with the basePath.

          Next's basePath rewrites links, the router and assets — but NOT
          fetch(). The office calls its own API with root-relative paths
          ("/api/studio", "/api/runtime/custom", ~19 of them), so under
          /office every one of those lands on the Pulse dashboard at the
          origin root instead, 404s, and the office silently falls back to
          its defaults ("hermes / disconnected / 0 agents").

          Patching fetch once here is far smaller than rewriting every call
          site, and it cannot miss one. Runs before hydration so no request
          escapes it.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var b=" + JSON.stringify(process.env.HERMES3D_BASE_PATH || "") + ";if(!b)return;var f=window.fetch;window.fetch=function(i,o){try{if(typeof i==='string'&&i.charAt(0)==='/'&&i.indexOf(b+'/')!==0){i=b+i;}else if(i&&i.url&&typeof i.url==='string'){var u=new URL(i.url,location.origin);if(u.origin===location.origin&&u.pathname.charAt(0)==='/'&&u.pathname.indexOf(b+'/')!==0){u.pathname=b+u.pathname;i=new Request(u.toString(),i);}}}catch(e){}return f.call(this,i,o);};}catch(e){}})();",
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var d=t?t==='dark':m;document.documentElement.classList.toggle('dark',d);}catch(e){}})();",
          }}
        />
      </head>
      <body className={`${display.variable} ${sans.variable} ${mono.variable} antialiased`}>
        <main className="h-screen w-screen overflow-hidden bg-background">{children}</main>
      </body>
    </html>
  );
}
