import { DomainError, deleteNeighborhood, updateNeighborhood } from "@/db/commands";
import { getVillageProfile } from "@/db/queries";
import { requireStaffCapability } from "@/lib/auth/guard";
import { neighborhoodUpdateSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../../_lib/respond";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/registry/neighborhoods/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const { officer } = await requireStaffCapability("manageArea");

    const draft = await parseBody(neighborhoodUpdateSchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const neighborhood = await updateNeighborhood({
      villageId: village.id,
      staffId: officer.id,
      neighborhoodId: id,
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

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/registry/neighborhoods/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const { officer } = await requireStaffCapability("manageArea");

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const deleted = await deleteNeighborhood({
      villageId: village.id,
      staffId: officer.id,
      neighborhoodId: id,
    });

    return { ok: true, neighborhood: deleted };
  });
}