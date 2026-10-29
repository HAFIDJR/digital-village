import { DomainError, setResidentAccountActive } from "@/db/commands";
import { getVillageProfile } from "@/db/queries";
import { requireStaffCapability } from "@/lib/auth/guard";
import { residentAccountStatusSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * Activates or deactivates a resident's portal account. Deactivation revokes
 * every live session immediately — the portal stops working on the next
 * request, which `getCurrentActor` enforces from `account.active`.
 */
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/registry/accounts/[residentId]">,
) {
  const { residentId } = await ctx.params;

  return withApi(async () => {
    const { officer } = await requireStaffCapability("manageRegistry");

    const draft = await parseBody(residentAccountStatusSchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const account = await setResidentAccountActive({
      villageId: village.id,
      staffId: officer.id,
      residentId,
      active: draft.active,
    });

    return { ok: true, account };
  });
}