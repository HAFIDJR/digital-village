import { DomainError } from "@/db/commands";
import { globalSearch, getVillageProfile } from "@/db/queries";
import { globalSearchSchema } from "@/lib/validators";

import { parseSearchParams, withApi } from "../_lib/respond";
import { requireStaffSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withApi(async () => {
    await requireStaffSession();
    const { q, limit } = parseSearchParams(globalSearchSchema, request);

    const village = await getVillageProfile();
    if (!village) throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);

    const results = await globalSearch(village.id, q, limit);
    return { ...results, query: q };
  });
}