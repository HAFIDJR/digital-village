import * as React from "react";

import { DashboardFrame } from "@/components/dashboard/dashboard-frame";
import { ensureDatabaseReady } from "@/db/bootstrap";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  await ensureDatabaseReady();

  return <DashboardFrame>{children}</DashboardFrame>;
}
