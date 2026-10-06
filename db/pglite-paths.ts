import fs from "node:fs";
import path from "node:path";


export const PGLITE_DATA_DIR =
  process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pgdata");

export const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

/**
 * PGlite's Node filesystem shim calls `mkdirSync` on the data directory but not
 * on its parents. Create the whole chain ourselves so a cold clone boots.
 */
export function getPgliteDataDir(): string {
  fs.mkdirSync(path.dirname(PGLITE_DATA_DIR), { recursive: true });
  return PGLITE_DATA_DIR;
}