import { DomainError, createHamlet } from "@/db/commands";
import { getVillageProfile } from "@/db/queries";
import { requireStaffCapability } from "@/lib/auth/guard";
import { hamletDraftSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withApi(async () => {
    const { officer } = await requireStaffCapability("manageArea");

    const draft = await parseBody(hamletDraftSchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const hamlet = await createHamlet({
      villageId: village.id,
      staffId: officer.id,
      draft,
    });

    return {
      ok: true,
      hamlet: {
        id: hamlet.id,
        name: hamlet.name,
        code: hamlet.code,
        headName: hamlet.headName,
      },
    };
  });
}