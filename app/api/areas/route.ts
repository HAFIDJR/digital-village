import { DomainError } from "@/db/commands";
import { getVillageProfile, listAreas } from "@/db/queries";

import { withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

/** Dusun / RT / RW breakdown. Small and bounded: the village has four dusun. */
export async function GET() {
  return withApi(async () => {
    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const areas = await listAreas(village.id);
    return { ...areas, serverTime: new Date().toISOString() };
  });
}
