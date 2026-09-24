/**
 * Migration runner.
 *
 * Executes every `.sql` file in `db/migrations` in lexical order, exactly once,
 * tracking applied files in `__dv_migrations`. Safe to call concurrently — the
 * advisory lock makes parallel `next dev` workers queue rather than race.
 *
 * Works against either driver: PGlite in development, postgres-js in production.
 */
import { sql } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";

import { getDb } from "./client";
import { MIGRATIONS_DIR } from "./pglite-paths";

let inFlight: Promise<{ applied: string[]; skipped: string[] }> | null = null;

async function readMigrationFiles() {
  let entries: string[];
  try {
    entries = await fs.readdir(MIGRATIONS_DIR);
  } catch {
    return [];
  }

  const files = entries.filter((f) => f.endsWith(".sql")).sort();

  return Promise.all(
    files.map(async (file) => ({
      name: file,
      statements: await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8"),
    })),
  );
}

/**
 * PGlite runs multi-statement strings in one round trip, so we do not need to
 * split on `;` — which would corrupt any function body containing one.
 */
async function applyMigration(statements: string) {
  const db = await getDb();
  const { getRawClient } = await import("./client");

  if (process.env.DATABASE_DRIVER === "postgres") {
    await db.execute(sql.raw(statements));
    return;
  }

  const client = await getRawClient();
  await client.exec(statements);
}

export async function runMigrations() {
  // Boot-time guard: Next.js may evaluate a route handler for several parallel
  // requests at once. Collapse them onto one migration pass.
  inFlight ??= (async () => {
    const db = await getDb();

    await db.execute(sql`
      create table if not exists __dv_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const appliedRows = await db.execute<{ name: string }>(
      sql`select name from __dv_migrations`,
    );
    const applied = new Set(appliedRows.rows.map((r) => r.name));

    const migrations = await readMigrationFiles();
    const freshlyApplied: string[] = [];
    const skipped: string[] = [];

    for (const migration of migrations) {
      if (applied.has(migration.name)) {
        skipped.push(migration.name);
        continue;
      }

      await applyMigration(migration.statements);
      await db.execute(
        sql`insert into __dv_migrations (name) values (${migration.name}) on conflict do nothing`,
      );
      freshlyApplied.push(migration.name);
    }

    return { applied: freshlyApplied, skipped };
  })().catch((error) => {
    // Allow a retry on the next request rather than wedging the process.
    inFlight = null;
    throw error;
  });

  return inFlight;
}

export async function migrationStatus() {
  const db = await getDb();
  const rows = await db.execute<{ name: string; applied_at: Date }>(
    sql`select name, applied_at from __dv_migrations order by name`,
  );
  const files = await readMigrationFiles();
  return files.map((f) => ({
    name: f.name,
    applied: rows.rows.some((r) => r.name === f.name),
    appliedAt: rows.rows.find((r) => r.name === f.name)?.applied_at ?? null,
  }));
}
