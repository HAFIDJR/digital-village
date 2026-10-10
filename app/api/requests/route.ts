import { DomainError } from "@/db/commands";
import { getVillageProfile, listLetterRequests } from "@/db/queries";
import { parseQueueQuery } from "@/lib/validators";

import { withApi } from "../_lib/respond";
import { requireStaffSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  return withApi(async () => {
    await requireStaffSession();
    const query = parseQueueQuery(params);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const page = await listLetterRequests(village.id, query);
    return { ...page, query, serverTime: new Date().toISOString() };
  });
}