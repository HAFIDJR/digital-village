import { DomainError } from "@/db/commands";
import { getVillageProfile, listAreas } from "@/db/queries";

import { withApi } from "../_lib/respond";
import { requireStaffSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(async () => {
     await requireStaffSession();
    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const areas = await listAreas(village.id);
    return { ...areas, serverTime: new Date().toISOString() };
  });
}