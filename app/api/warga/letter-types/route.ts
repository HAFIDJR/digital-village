import { DomainError } from "@/db/commands";
import { getVillageProfile, listResidentLetterTypes } from "@/db/queries";
import { requireResidentSession } from "@/lib/auth/guard";

import { withApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * The service catalogue for the "Ajukan Surat" form: what the village issues,
 * how long each letter takes, and which scans it requires.
 */
export async function GET() {
  return withApi(async () => {
    await requireResidentSession();

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    return {
      letterTypes: await listResidentLetterTypes(village.id),
      serverTime: new Date().toISOString(),
    };
  });
}
