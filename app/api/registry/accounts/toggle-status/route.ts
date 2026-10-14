import { DomainError } from "@/db/commands";
import { getVillageProfile } from "@/db/queries";
import { requireStaffCapability } from "@/lib/auth/guard";
import { toggleResidentAccountStatus } from "@/db/commands";
import { withApi } from "../../../_lib/respond";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withApi(async () => {
    const { officer } = await requireStaffCapability("manageResidentAccounts");

    const body = await request.json();
    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const result = await toggleResidentAccountStatus({
      villageId: village.id,
      staffId: officer.id,
      residentId: body.residentId,
    });

    return {
      ok: true,
      residentId: body.residentId,
      active: result.active,
    };
  });
}
