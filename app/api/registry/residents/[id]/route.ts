import { DomainError, updateResident } from "@/db/commands";
import { getVillageProfile } from "@/db/queries";
import { requireStaffCapability } from "@/lib/auth/guard";
import { residentUpdateSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * Edits demographic data or records a population mutation
 * (capability: manageRegistry).
 */
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/registry/residents/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    // Authorise before reading the body so an unauthorised caller gets a clean
    // 403 instead of validation feedback.
    const { officer } = await requireStaffCapability("manageRegistry");

    const draft = await parseBody(residentUpdateSchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const resident = await updateResident({
      villageId: village.id,
      staffId: officer.id,
      residentId: id,
      draft,
    });

    return {
      ok: true,
      resident: {
        id: resident.id,
        nik: resident.nik,
        fullName: resident.fullName,
        familyId: resident.familyId,
        neighborhoodId: resident.neighborhoodId,
        status: resident.status,
        documentsVerified: resident.documentsVerified,
      },
    };
  });
}
