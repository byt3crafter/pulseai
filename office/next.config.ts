import type { NextConfig } from "next";
import path from "node:path";

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

const nextConfig: NextConfig = {
  // PULSE PATCH: serve under /office on the SAME ORIGIN as the Pulse dashboard.
  // Hermes3D sends X-Frame-Options: SAMEORIGIN and frame-ancestors 'self', so a
  // subdomain could never be embedded — same-origin is the only way it can run
  // inside the dashboard rather than beside it. basePath also keeps its /_next
  // assets from colliding with the dashboard's own.
  basePath: process.env.HERMES3D_BASE_PATH || undefined,
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
