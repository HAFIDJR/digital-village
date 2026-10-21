import { DomainError, deleteResident, updateResident } from "@/db/commands";
import { getVillageProfile } from "@/db/queries";
import { requireStaffCapability } from "@/lib/auth/guard";
import { residentUpdateSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../../_lib/respond";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/registry/residents/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
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
/**
 * Permanently removes a resident. Blocked with 409 when the resident still
 * has letter requests or reports — archive them or record a mutation first.
 */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/registry/residents/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const { officer } = await requireStaffCapability("manageRegistry");

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const deleted = await deleteResident({
      villageId: village.id,
      staffId: officer.id,
      residentId: id,
    });

    return { ok: true, resident: deleted };
  });
}
