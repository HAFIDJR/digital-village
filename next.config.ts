import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // `@electric-sql/pglite` ships a WebAssembly Postgres build plus .wasm assets and
  // reads migration files from disk at runtime. Keep it external so the bundler
  // never tries to inline the wasm binary.
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "qrcode"],

  // The workspace preview is served from a proxied host (*.e2b.app). Next.js 16
  // blocks cross-origin dev asset requests unless the host is allow-listed.
  allowedDevOrigins: ["*.e2b.app", "**.e2b.app", "localhost"],

  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
