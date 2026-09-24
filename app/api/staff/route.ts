import { DomainError } from "@/db/commands";
import { getVillageProfile, listLetterTypes, listStaff } from "@/db/queries";

import { withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

/** Perangkat desa roster plus the letter-service catalogue for /pengaturan. */
export async function GET() {
  return withApi(async () => {
    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const [staff, letterTypes] = await Promise.all([
      listStaff(village.id),
      listLetterTypes(village.id),
    ]);

    return { village, staff, letterTypes, serverTime: new Date().toISOString() };
  });
}
