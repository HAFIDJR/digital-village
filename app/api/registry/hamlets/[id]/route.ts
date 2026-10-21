import { DomainError, deleteHamlet, updateHamlet } from "@/db/commands";
import { getVillageProfile } from "@/db/queries";
import { requireStaffCapability } from "@/lib/auth/guard";
import { hamletUpdateSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../../_lib/respond";

export const dynamic = "force-dynamic";

/** Edits a Dusun's label, code, or kepala dusun. */
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/registry/hamlets/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const { officer } = await requireStaffCapability("manageArea");

    const draft = await parseBody(hamletUpdateSchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const hamlet = await updateHamlet({
      villageId: village.id,
      staffId: officer.id,
      hamletId: id,
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

/** Removes a Dusun — only when it no longer holds RT/RW, penduduk, or KK. */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/registry/hamlets/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const { officer } = await requireStaffCapability("manageArea");

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const deleted = await deleteHamlet({
      villageId: village.id,
      staffId: officer.id,
      hamletId: id,
    });

    return { ok: true, hamlet: deleted };
  });
}
