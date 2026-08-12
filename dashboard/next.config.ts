import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // ssh2 loads a native-ish crypto asset that Turbopack can't bundle into an
  // ESM chunk — keep it as a real Node require in the server bundle instead
  // of trying to inline it. Only used server-side (server actions).
  serverExternalPackages: ['ssh2'],
  // Document/receipt uploads go through a server action as a base64 string
  // field; a 10 MB file is ~13.3 MB base64, so lift the default 1 MB limit.
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  // The docs pages read their markdown from src/content/docs at request time.
  // They live under the dashboard's force-dynamic layout, so they can't be
  // prerendered — which means those .md files must be traced into the
  // standalone output or the container would 404 every docs page.
  outputFileTracingIncludes: {
    '/dashboard/docs/[[...slug]]': ['./src/content/docs/**/*'],
  },
};

export default nextConfig;
