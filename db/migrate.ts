import { sql } from "drizzle-orm";
import fs from "node:fs/promises";
import path from "node:path";
import "dotenv/config";

import { getDb } from "./client";
import { MIGRATIONS_DIR } from "./pglite-paths";

let inFlight: Promise<{ applied: string[]; skipped: string[] }> | null = null;

export function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const r = result as { rows?: T[] };
  return r.rows ?? [];
}

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
  inFlight ??= (async () => {
    const db = await getDb();

    await db.execute(sql`
      create table if not exists __dv_migrations (
        name text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const appliedResult = await db.execute<{ name: string }>(
      sql`select name from __dv_migrations`,
    );
    const applied = new Set(
      getRows<{ name: string }>(appliedResult).map((r) => r.name),
    );

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
    inFlight = null;
    throw error;
  });

  return inFlight;
}

export async function migrationStatus() {
  const db = await getDb();
  const result = await db.execute<{ name: string; applied_at: Date }>(
    sql`select name, applied_at from __dv_migrations order by name`,
  );
  const rowList = getRows<{ name: string; applied_at: Date }>(result);
  const files = await readMigrationFiles();

  return files.map((f) => ({
    name: f.name,
    applied: rowList.some((r) => r.name === f.name),
    appliedAt: rowList.find((r) => r.name === f.name)?.applied_at ?? null,
  }));
}