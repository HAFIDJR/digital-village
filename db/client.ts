/**
 * Database client factory.
 *
 * Two interchangeable drivers sit behind one interface:
 *
 *  1. `pglite` (default) — PostgreSQL 18 compiled to WebAssembly, persisting to
 *     `.data/pgdata`. Zero external services, which is what makes this repo
 *     runnable in any sandbox or on an officer's laptop for a demo.
 *
 *  2. `postgres` — a real TCP connection via postgres-js, used in production
 *     (`DATABASE_DRIVER=postgres`, `DATABASE_URL=postgres://...`).
 *
 * Both are wired to the *same* Drizzle schema and the same migrations, so the
 * switch is a single environment variable, not a code change.
 */
import { sql } from "drizzle-orm";
import { drizzle as drizzleNode } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";

import * as schema from "./schema";

export type DatabaseDriver = "pglite" | "postgres";

export const DATABASE_DRIVER: DatabaseDriver =
  process.env.DATABASE_DRIVER === "postgres" ? "postgres" : "pglite";

/**
 * The village's business timezone.
 *
 * "Surat masuk hari ini", SLA cut-offs and monthly roll-ups all mean the *office*
 * day, not the container's UTC day. Pinning the session timezone makes every
 * `now()`, `date_trunc('day', …)` and `::date` cast resolve in WIB, so no query
 * has to remember the offset — and a request filed at 07:30 WIB is never counted
 * as yesterday's.
 */
export const VILLAGE_TIMEZONE = "Asia/Jakarta";

/* -------------------------------------------------------------------------- */
/* PGlite singleton                                                            */
/* -------------------------------------------------------------------------- */
/* `next dev` hot-reloads modules on every edit. Without caching the client on  */
/* globalThis we would open a new WASM Postgres per edit and exhaust memory.    */

type PgliteInstance = Awaited<ReturnType<typeof createPglite>>;
type DrizzleDb = ReturnType<typeof buildPgliteDb>;

async function createPglite() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { getPgliteDataDir } = await import("./pglite-paths");

  return new PGlite(getPgliteDataDir());
}

const globalForDb = globalThis as unknown as {
  __dvPglite?: Promise<PgliteInstance>;
  __dvDb?: DrizzleDb;
  __dvTimezonePinned?: boolean;
};

function getPgliteClient(): Promise<PgliteInstance> {
  globalForDb.__dvPglite ??= createPglite();
  return globalForDb.__dvPglite;
}

/**
 * `SET TIME ZONE` is a session setting, so it has to be re-applied whenever the
 * WASM engine is (re)booted — once per instance is enough.
 */
async function getPinnedPgliteClient(): Promise<PgliteInstance> {
  const client = await getPgliteClient();
  if (!globalForDb.__dvTimezonePinned) {
    await client.exec(`set time zone '${VILLAGE_TIMEZONE}'`);
    globalForDb.__dvTimezonePinned = true;
  }
  return client;
}

function buildPgliteDb(client: PgliteInstance) {
  return drizzlePglite(client, {
    schema,
    casing: "snake_case",
    logger: process.env.DRIZZLE_LOG === "true",
  });
}

/* -------------------------------------------------------------------------- */

/**
 * Resolves the Drizzle instance. The PGlite branch is async because the WASM
 * engine boots lazily on first query.
 */
export async function getDb() {
  if (globalForDb.__dvDb) return globalForDb.__dvDb;

  if (DATABASE_DRIVER === "postgres") {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_DRIVER=postgres requires DATABASE_URL, e.g. postgres://user:pass@localhost:5432/digital_village",
      );
    }
    const { default: postgres } = await import("postgres");
    const db = drizzleNode(
      // `connection.timezone` applies the same session timezone to every pooled
      // connection, keeping the TCP driver behaviourally identical to PGlite.
      postgres(url, { max: 10, onnotice: () => {}, connection: { timezone: VILLAGE_TIMEZONE } }),
      { schema, casing: "snake_case" },
    );
    globalForDb.__dvDb = db as unknown as DrizzleDb;
    return globalForDb.__dvDb;
  }

  const client = await getPinnedPgliteClient();
  globalForDb.__dvDb ??= buildPgliteDb(client);
  return globalForDb.__dvDb;
}

/** Escape hatch for scripts and health checks that need the raw client. */
export async function getRawClient(): Promise<PgliteInstance> {
  return getPinnedPgliteClient();
}

export async function pingDatabase() {
  const db = await getDb();
  const result = await db.execute<{ version: string; now: Date; timezone: string }>(
    sql`select version() as version, now() as now, current_setting('TimeZone') as timezone`,
  );
  const row = result.rows[0];
  return {
    version: row?.version ?? "unknown",
    now: row?.now ?? new Date(),
    timezone: row?.timezone ?? "unknown",
  };
}

export { schema };
export type Db = Awaited<ReturnType<typeof getDb>>;
