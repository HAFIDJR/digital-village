import { DomainError } from "@/db/commands";
import { getVillageProfile } from "@/db/queries";
import { requireStaffCapability } from "@/lib/auth/guard";
import { resetResidentPassword } from "@/db/commands";
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

    const result = await resetResidentPassword({
      villageId: village.id,
      staffId: officer.id,
      residentId: body.residentId,
      newPassword: body.newPassword,
    });

    return {
      ok: true,
      residentId: body.residentId,
      nik: result.nik,
    };
  });
}
