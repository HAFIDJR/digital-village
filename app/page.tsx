import { ensureDatabaseReady } from "@/db/bootstrap";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

// The dashboard reads live operational data on every request: no static
// prerender, no shared ISR cache between officers.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Runs pending migrations — and, on an empty database, seeds Desa Sukamaju —
  // before the client's first RTK Query call lands.
  await ensureDatabaseReady();

  return <DashboardShell />;
}
