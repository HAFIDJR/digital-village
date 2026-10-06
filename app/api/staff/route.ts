import { DomainError } from "@/db/commands";
import { getVillageProfile, listLetterTypes, listStaff } from "@/db/queries";
import { requireStaffCapability } from "@/lib/auth/guard";

import { withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * Staff roster, role capabilities and the letter-type catalogue — this powers
 * "Pengaturan & Konfigurasi Desa", so it is restricted to roles carrying the
 * `manageSettings` capability.
 */
export async function GET() {
  return withApi(async () => {
    await requireStaffCapability("manageSettings");

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const [staff, letterTypes] = await Promise.all([
      listStaff(village.id),
      listLetterTypes(village.id),
    ]);

    return {
      village,
      staff,
      letterTypes,
      serverTime: new Date().toISOString(),
    };
  });
}
