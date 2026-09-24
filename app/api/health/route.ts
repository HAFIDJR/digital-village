import { NextResponse } from "next/server";

import { DATABASE_DRIVER, pingDatabase } from "@/db/client";
import { getBootstrapState } from "@/db/bootstrap";
import { migrationStatus } from "@/db/migrate";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness probe.
 *
 * Reports the actual Postgres version the process is talking to, which is how
 * an operator confirms whether they are on the embedded engine or a managed
 * instance.
 */
export async function GET() {
  const startedAt = Date.now();
  const boot = getBootstrapState();

  try {
    const [{ version, now }, migrations] = await Promise.all([pingDatabase(), migrationStatus()]);

    return NextResponse.json(
      {
        status: "ok",
        driver: DATABASE_DRIVER,
        engine: version.split(" ").slice(0, 2).join(" "),
        serverTime: now,
        bootstrap: boot.status,
        migrations: migrations.map((m) => ({ name: m.name, applied: m.applied })),
        latencyMs: Date.now() - startedAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        driver: DATABASE_DRIVER,
        bootstrap: boot.status,
        message: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startedAt,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
