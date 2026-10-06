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

  // The proxy bounces cookieless visitors to /masuk (with a `next` param);
  // this backstop catches sessions that expired or were revoked mid-shift,
  // and sends residents back to their own portal.
  await requireStaffPage();

  return <DashboardFrame>{children}</DashboardFrame>;
}
