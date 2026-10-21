import { DomainError, resetResidentAccountPassword } from "@/db/commands";
import { getVillageProfile } from "@/db/queries";
import { requireStaffCapability } from "@/lib/auth/guard";
import { residentAccountResetSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../../../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * Resets a resident's portal password from the registry desk. Clears the
 * failed-attempt lockout and revokes live sessions so the old credential
 * cannot keep working anywhere. The password itself is never logged.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/registry/accounts/[residentId]/password">,
) {
  const { residentId } = await ctx.params;

  return withApi(async () => {
    const { officer } = await requireStaffCapability("manageRegistry");

    const draft = await parseBody(residentAccountResetSchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const account = await resetResidentAccountPassword({
      villageId: village.id,
      staffId: officer.id,
      residentId,
      password: draft.password,
    });

    return { ok: true, account };
  });
}
