import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /*
   * `next dev` and `next build` must never share an output directory.
   *
   * When they do, the production build overwrites the dev server's client
   * chunks mid-session and the browser keeps a module graph that no longer
   * matches the server: a helper that exists in the source comes back as
   * "is not a function" at runtime. So dev keeps `.next` and production builds
   * land in `build/` (both are gitignored and excluded from snapshots).
   */
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

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
