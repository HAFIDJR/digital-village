import { DomainError } from "@/db/commands";
import { getVillageProfile, listFamilies, listResidents } from "@/db/queries";
import { parseRegistryQuery } from "@/lib/validators";

import { withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * Population registry.
 *
 * Residents and families share one endpoint because they share one page shape —
 * `type` picks the relation, everything else (paging, search, dusun) is
 * identical. The response is typed as a union by the client, not by widening
 * both row shapes into one.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  return withApi(async () => {
    const query = parseRegistryQuery(params);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const page =
      query.type === "families"
        ? await listFamilies(village.id, query)
        : await listResidents(village.id, query);

    return { ...page, type: query.type, query, serverTime: new Date().toISOString() };
  });
}
