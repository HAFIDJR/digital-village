import { DomainError, deleteFamily, updateFamily } from "@/db/commands";
import { getFamilyDetail, getVillageProfile } from "@/db/queries";
import { requireStaffCapability } from "@/lib/auth/guard";
import { familyUpdateSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../../_lib/respond";

export const dynamic = "force-dynamic";

/** One Kartu Keluarga with its member list — the family detail sheet. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/registry/families/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    await requireStaffCapability("manageRegistry");

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const family = await getFamilyDetail(village.id, id);
    if (!family) {
      throw new DomainError("Kartu keluarga tidak ditemukan.", "FAMILY_NOT_FOUND", 404);
    }

    return { ok: true, family };
  });
}

/** Edits KK data and/or replaces the member set (see `updateFamily`). */
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/registry/families/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const { officer } = await requireStaffCapability("manageRegistry");

    const draft = await parseBody(familyUpdateSchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const family = await updateFamily({
      villageId: village.id,
      staffId: officer.id,
      familyId: id,
      draft,
    });

    return {
      ok: true,
      family: {
        id: family.id,
        kkNumber: family.kkNumber,
        headName: family.headName,
        memberCount: family.memberCount,
        neighborhoodId: family.neighborhoodId,
      },
    };
  });
}

/** Deletes a KK; its members are released back to "tanpa KK". */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/registry/families/[id]">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const { officer } = await requireStaffCapability("manageRegistry");

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const deleted = await deleteFamily({
      villageId: village.id,
      staffId: officer.id,
      familyId: id,
    });

    return { ok: true, family: deleted };
  });
}
