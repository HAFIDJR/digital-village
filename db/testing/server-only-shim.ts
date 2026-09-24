/**
 * Node-side stand-in for the `server-only` sentinel.
 *
 * Next.js aliases the `server-only` specifier to a module that throws if it is
 * pulled into a client bundle. That alias only exists inside a Next build, so
 * CLI scripts and verification harnesses running under `tsx` resolve this file
 * instead — see `tsconfig.scripts.json`.
 *
 * Keeping the real import in `db/queries.ts` and `db/commands.ts` is what we
 * want: it makes "forgot to mark this server-only" a build error rather than a
 * data leak. This shim only relaxes that for non-bundled entry points.
 */
export {};
