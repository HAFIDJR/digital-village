import { DomainError } from "@/db/commands";
import { getVillageProfile, listResidentReports } from "@/db/queries";
import { requireResidentSession } from "@/lib/auth/guard";

import { withApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

/** "Laporan Saya" — every report the signed-in resident has filed. */
export async function GET() {
  return withApi(async () => {
    const actor = await requireResidentSession();

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const reports = await listResidentReports(village.id, actor.resident.id);

    return { reports, serverTime: new Date().toISOString() };
  });
}
