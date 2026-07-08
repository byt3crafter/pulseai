import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // ssh2 loads a native-ish crypto asset that Turbopack can't bundle into an
  // ESM chunk — keep it as a real Node require in the server bundle instead
  // of trying to inline it. Only used server-side (server actions).
  serverExternalPackages: ['ssh2'],
};

export default nextConfig;
