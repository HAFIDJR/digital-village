import * as React from "react";

import { DashboardFrame } from "@/components/dashboard/dashboard-frame";
import { ensureDatabaseReady } from "@/db/bootstrap";
import { requireStaffPage } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await ensureDatabaseReady();
  await requireStaffPage();

  return <DashboardFrame>{children}</DashboardFrame>;
}
