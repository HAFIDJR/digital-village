import { DomainError } from "@/db/commands";
import { requireStaffSession } from "@/lib/auth/guard";
import { getVillageProfile, listReports } from "@/db/queries";
import { parseReportQuery } from "@/lib/validators";

import { withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  return withApi(async () => {
    await requireStaffSession();

    const query = parseReportQuery(params);

    const village = await getVillageProfile();

    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }
    const page = await listReports(village.id, query);

    return {
      ...page,
      query,
      serverTime: new Date().toISOString(),
    };
  });
}
