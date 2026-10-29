import { DomainError, createNeighborhood } from "@/db/commands";
import { getVillageProfile } from "@/db/queries";
import { requireStaffCapability } from "@/lib/auth/guard";
import { neighborhoodDraftSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withApi(async () => {
    const { officer } = await requireStaffCapability("manageArea");

    const draft = await parseBody(neighborhoodDraftSchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const neighborhood = await createNeighborhood({
      villageId: village.id,
      staffId: officer.id,
      draft,
    });

    return {
      ok: true,
      neighborhood: {
        id: neighborhood.id,
        hamletId: neighborhood.hamletId,
        rt: neighborhood.rt,
        rw: neighborhood.rw,
        headName: neighborhood.headName,
      },
    };
  });
}