import { DomainError } from "@/db/commands";
import { getVillageProfile, listLetterRequests } from "@/db/queries";
import { parseQueueQuery } from "@/lib/validators";

import { withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * The worklist on its own.
 *
 * RTK Query hits this endpoint when a filter, sort or page changes while the
 * rest of the dashboard stays mounted — the KPI row must not flicker just
 * because an officer narrowed the table to Dusun 02.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  return withApi(async () => {
    const query = parseQueueQuery(params);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const page = await listLetterRequests(village.id, query);
    return { ...page, query, serverTime: new Date().toISOString() };
  });
}
