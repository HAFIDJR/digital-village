import { DomainError } from "@/db/commands";
import { getFamilyReport, getVillageProfile } from "@/db/queries";
import { requireStaffSession } from "@/lib/auth/guard";

import { withApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(async () => {
    await requireStaffSession();

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const report = await getFamilyReport(village.id);

    return { ...report, serverTime: new Date().toISOString() };
  });
}