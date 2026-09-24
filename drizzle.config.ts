import { defineConfig } from "drizzle-kit";

/**
 * Schema source of truth is `db/schema.ts`.
 *
 *   npm run db:generate   -> writes versioned SQL into db/migrations
 *   npm run db:migrate    -> applies pending SQL to the configured database
 *
 * We always emit plain PostgreSQL dialect SQL: it is executed verbatim by
 * PGlite (Postgres 18/WASM) in development and by a managed Postgres in
 * production, so there is exactly one migration truth.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/digital_village",
  },
});
