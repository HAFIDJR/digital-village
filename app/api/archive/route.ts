import { DomainError } from "@/db/commands";
import { getVillageProfile, listArchivedLetters } from "@/db/queries";
import { parseQueueQuery } from "@/lib/validators";

import { withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  return withApi(async () => {
    const query = parseQueueQuery(params);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const page = await listArchivedLetters(village.id, query);
    return { ...page, query, serverTime: new Date().toISOString() };
  });
}
