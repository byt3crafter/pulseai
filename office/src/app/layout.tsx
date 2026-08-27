import type { Metadata } from "next";
import { Bebas_Neue, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { PULSE_RUNTIME_GLOBAL, resolvePulseRuntime } from "@/lib/office/pulse-runtime";

/*
  PULSE PATCH: render at request time so the runtime below is the live one.

  Without this Next statically prerenders these routes and bakes process.env at
  BUILD time — where HERMES3D_GATEWAY_URL does not exist, since it is set by
  docker-compose at run time. The page would ship a null runtime and fall
  straight back into the boot state this patch exists to remove.
*/
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Floor — Pulse AI",
  description: "Your Pulse workspace as a 3D office.",
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
        {/*
          PULSE PATCH: hand the browser its runtime in the HTML itself.

          The office is a Pulse client from its first paint, not after a
          successful round-trip. process.env is server-only, so without this the
          browser's opening belief is the upstream default — Hermes on
          ws://localhost:18789 — and the only thing that could correct it was a
          /api/studio fetch with no timeout and a Hermes fallback. On a slow
          link that never landed, and the office sat on "Connecting to your
          runtime…" forever.

          Stamped here in the root layout rather than threaded as a prop so
          every route gets it — the office, the agents screen, the builder — and
          no future route can be added without it.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window." +
              PULSE_RUNTIME_GLOBAL +
              "=" +
              JSON.stringify(resolvePulseRuntime()) +
              ";",
          }}
        />
      </head>
      <body className={`${display.variable} ${sans.variable} ${mono.variable} antialiased`}>
        <main className="h-screen w-screen overflow-hidden bg-background">{children}</main>
      </body>
    </html>
  );
}
