// PULSE PATCH: this is next.config.ts ported to plain ESM.
//
// Next reads the config at BOOT. With a .ts config and a production-only
// node_modules, it tries to npm-install typescript at startup to transpile it —
// which in a container fails ("No lockfile found" -> failed transpile -> crash
// loop) and, even when it works, means a production image installing packages
// on boot. Plain JS removes the need entirely.
//
// Keep in sync with upstream's next.config.ts when re-syncing (see PATCHES.md).

import path from "node:path";
import { fileURLToPath } from "node:url";

// __dirname does not exist in ESM.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "img-src 'self' data: blob: http: https:",
      "font-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https:",
      // 'unsafe-eval' is required by Next.js dev mode (source maps, HMR).
      // In production it is dropped — React and Three.js do not need eval.
      ...(process.env.NODE_ENV !== "production"
        ? ["script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:"]
        : ["script-src 'self' 'unsafe-inline' blob:"]),
      // connect-src is intentionally broad: gateway URLs are user-configured
      // at runtime and cannot be enumerated at build time.
      // Restrict further when a fixed deployment target is known.
      "connect-src 'self' ws: wss: http: https:",
      "media-src 'self' blob: data: http: https:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), browsing-topics=()",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
];

if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // PULSE PATCH: served under /office on the SAME ORIGIN as the dashboard.
  //
  // assetPrefix, NOT basePath. basePath rewrites routing, and Next only strips
  // it inside its own server — behind this app's custom server the prefix
  // survives, no route matches, and the catch-all /[...invalid] redirects every
  // API call to /office. assetPrefix touches asset URLs only, so routing stays
  // exactly as upstream wrote it and nginx strips /office on the way in.
  //
  // It still solves the collision that made a prefix necessary: without it the
  // office and the dashboard both serve /_next/.
  assetPrefix: process.env.HERMES3D_BASE_PATH || undefined,
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
