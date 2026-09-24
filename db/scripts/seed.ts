/**
 * CLI: populate the database with Desa Sukamaju.
 *   npm run db:seed          — seeds only if empty
 *   npm run db:seed -- --reset — truncates first
 */
import { readEsignPassphrase } from "@/lib/esign";

import { runMigrations } from "../migrate";
import { seedDatabase } from "../seed";

async function main() {
  const reset = process.argv.includes("--reset");

  const { applied } = await runMigrations();
  if (applied.length) console.log(`[seed] applied ${applied.length} migration(s)`);

  const result = await seedDatabase({ reset });
  if (result.skipped) {
    console.log(`[seed] skipped — ${result.reason}. Use --reset to rebuild.`);
    return;
  }

  console.log(`[seed] Desa Sukamaju populated in ${result.durationMs}ms`);
  console.table(result.counts);

  // The dashboard's e-sign ceremony verifies a real passphrase digest, so the
  // credential that was just seeded has to be visible to whoever runs the demo.
  const esign = readEsignPassphrase();
  console.log(
    esign.isTrainingDefault
      ? `[seed] e-sign passphrase (training default): ${esign.passphrase}`
      : "[seed] e-sign passphrase taken from ESIGN_PASSPHRASE",
  );
}

/** Drizzle wraps driver errors; unwrap the chain so the real cause is legible. */
function reportError(error: unknown) {
  let cursor: unknown = error;
  let depth = 0;
  while (cursor instanceof Error && depth < 6) {
    const pg = cursor as Error & { code?: string; detail?: string; hint?: string };
    // Drizzle echoes the entire statement and parameter list; keep it short.
    const message = pg.message.length > 200 ? `${pg.message.slice(0, 200)}…` : pg.message;
    console.error(
      `[seed] ${depth === 0 ? "error" : "cause"}: ${message}` +
        (pg.code ? ` (code ${pg.code})` : "") +
        (pg.detail ? `\n        detail: ${pg.detail}` : "") +
        (pg.hint ? `\n        hint: ${pg.hint}` : ""),
    );
    cursor = cursor.cause;
    depth += 1;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    reportError(error);
    process.exit(1);
  });
