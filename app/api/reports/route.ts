import { DomainError } from "@/db/commands";
import { getVillageProfile, listReports } from "@/db/queries";
import { parseReportQuery } from "@/lib/validators";

import { withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * Citizen reports and aspirations.
 *
 * `pageSize` is validated against the shared page sizes, so a hand-edited query
 * string cannot ask Postgres for the whole table.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  return withApi(async () => {
    const query = parseReportQuery(params);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const page = await listReports(village.id, query);
    return { ...page, query, serverTime: new Date().toISOString() };
  });
}
