import * as React from "react";

import { DashboardFrame } from "@/components/dashboard/dashboard-frame";
import { ensureDatabaseReady } from "@/db/bootstrap";

/**
 * Shell layout for every operator route.
 *
 * Route groups keep the URL space untouched — `/penduduk` is still `/penduduk`
 * — while letting the chrome (topbar, rail, drawer, palette) live in one place.
 * The public certificate page at `app/verifikasi/[code]` stays outside the
 * group, so it keeps rendering without the operator chrome.
 *
 * `force-dynamic` because every page reads live operational data; there is no
 * static prerender and no ISR cache shared between officers.
 */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Runs pending migrations — and, on an empty database, seeds Desa Sukamaju —
  // before the client's first RTK Query call lands.
  await ensureDatabaseReady();

  return <DashboardFrame>{children}</DashboardFrame>;
}
