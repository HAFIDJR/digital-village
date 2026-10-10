import { DomainError, createResident } from "@/db/commands";
import { getVillageProfile } from "@/db/queries";
import { requireStaffCapability } from "@/lib/auth/guard";
import { residentDraftSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

/** Registers a penduduk with full demographic detail (capability: manageRegistry). */
export async function POST(request: Request) {
  return withApi(async () => {
    // Authorise before reading the body so an unauthorised caller gets a clean
    // 403 instead of validation feedback.
    const { officer } = await requireStaffCapability("manageRegistry");

    const draft = await parseBody(residentDraftSchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const resident = await createResident({
      villageId: village.id,
      staffId: officer.id,
      draft,
    });

    return {
      ok: true,
      resident: {
        id: resident.id,
        nik: resident.nik,
        fullName: resident.fullName,
        gender: resident.gender,
        birthDate: resident.birthDate,
        familyId: resident.familyId,
        neighborhoodId: resident.neighborhoodId,
        status: resident.status,
        documentsVerified: resident.documentsVerified,
      },
    };
  });
}
