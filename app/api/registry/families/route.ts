import { DomainError, createFamily } from "@/db/commands";
import { getVillageProfile } from "@/db/queries";
import { requireStaffCapability } from "@/lib/auth/guard";
import { familyDraftSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

/** Opens a Kartu Keluarga (capability: manageRegistry). */
export async function POST(request: Request) {
  return withApi(async () => {
    // Authorise before reading the body so an unauthorised caller gets a clean
    // 403 instead of validation feedback.
    const { officer } = await requireStaffCapability("manageRegistry");

    const draft = await parseBody(familyDraftSchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const family = await createFamily({
      villageId: village.id,
      staffId: officer.id,
      draft,
    });

    return {
      ok: true,
      family: {
        id: family.id,
        kkNumber: family.kkNumber,
        headName: family.headName,
        neighborhoodId: family.neighborhoodId,
        welfareClass: family.welfareClass,
        memberCount: family.memberCount,
      },
    };
  });
}
