import { migrationStatus } from "../migrate";
import { runMigrations } from "../migrate";
import { DATABASE_DRIVER } from "../client";

async function main() {
  if (DATABASE_DRIVER === "postgres" && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_DRIVER=postgres requires DATABASE_URL");
  }

  console.log(`[migrate] driver=${DATABASE_DRIVER}`);
  const { applied, skipped } = await runMigrations();

  if (!applied.length) {
    console.log(`[migrate] up to date (${skipped.length} migration(s) already applied)`);
  } else {
    console.log(`[migrate] applied ${applied.length} migration(s):`);
    for (const name of applied) console.log(`  ✓ ${name}`);
  }

  const status = await migrationStatus();
  console.table(
    status.map((s) => ({
      migration: s.name,
      applied: s.applied ? "yes" : "no",
      appliedAt: s.appliedAt ? new Date(s.appliedAt).toISOString() : "—",
    })),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[seed] error:", error); // full stack, not just .message
    process.exit(1);
  });