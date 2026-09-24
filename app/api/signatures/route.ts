import { DomainError } from "@/db/commands";
import { getVillageProfile, listSignatureQueue } from "@/db/queries";

import { withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

/** Digital-signature agenda: what is waiting on the Kepala Desa's e-sign. */
export async function GET() {
  return withApi(async () => {
    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const entries = await listSignatureQueue(village.id, 25);
    return { entries, serverTime: new Date().toISOString() };
  });
}
