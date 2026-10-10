import { DomainError } from "@/db/commands";
import { getVillageProfile, listFamilies, listResidents } from "@/db/queries";
import { parseRegistryQuery } from "@/lib/validators";

import { withApi } from "../_lib/respond";
import { requireStaffSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  return withApi(async () => {
    await requireStaffSession();
    const query = parseRegistryQuery(params);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const page =
      query.type === "families"
        ? await listFamilies(village.id, query)
        : await listResidents(village.id, query);

    return {
      ...page,
      type: query.type,
      query,
      serverTime: new Date().toISOString(),
    };
  });
}
