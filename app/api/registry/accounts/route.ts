import { DomainError, createResidentAccount } from "@/db/commands";
import { getVillageProfile } from "@/db/queries";
import { requireStaffCapability } from "@/lib/auth/guard";
import { residentAccountDraftSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * Provisions the portal login for a resident (capability: manageRegistry).
 * The password is hashed before it is stored and never echoed back.
 */
export async function POST(request: Request) {
  return withApi(async () => {
    // Authorise before reading the body so an unauthorised caller gets a clean
    // 403 instead of validation feedback.
    const { officer } = await requireStaffCapability("manageRegistry");

    const draft = await parseBody(residentAccountDraftSchema, request);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const account = await createResidentAccount({
      villageId: village.id,
      staffId: officer.id,
      draft,
    });

    return {
      ok: true,
      account: {
        id: account.id,
        residentId: account.residentId,
        nik: account.nik,
        active: account.active,
        createdAt: account.createdAt,
      },
    };
  });
}
