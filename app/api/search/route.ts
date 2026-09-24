import { DomainError } from "@/db/commands";
import { globalSearch, getVillageProfile } from "@/db/queries";
import { globalSearchSchema } from "@/lib/validators";

import { parseSearchParams, withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * Global instant search — NIK, nama, nomor KK, ticket, or report subject.
 *
 * Returns the three result families in one payload so the command palette
 * renders grouped results without a second round trip.
 */
export async function GET(request: Request) {
  // Parsing inside `withApi`: an unusable `limit` or a missing `q` must surface
  // as a 422 with field detail, not as an unhandled ZodError.
  return withApi(async () => {
    const { q, limit } = parseSearchParams(globalSearchSchema, request);

    const village = await getVillageProfile();
    if (!village) throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);

    const results = await globalSearch(village.id, q, limit);
    return { ...results, query: q };
  });
}
