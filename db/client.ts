import { sql } from "drizzle-orm";
import { drizzle as drizzleNode } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import "dotenv/config";

import * as schema from "./schema";

export type DatabaseDriver = "pglite" | "postgres";

export const DATABASE_DRIVER: DatabaseDriver =
  process.env.DATABASE_DRIVER === "postgres" ? "postgres" : "pglite";

export const VILLAGE_TIMEZONE = "Asia/Jakarta";

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


