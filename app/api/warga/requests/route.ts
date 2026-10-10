import { DomainError } from "@/db/commands";
import { getVillageProfile, listResidentRequests } from "@/db/queries";
import { requireResidentSession } from "@/lib/auth/guard";

import { withApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

/** The resident's own letter queue, kept live by the portal's RTK query. */
export async function GET() {
  return withApi(async () => {
    const actor = await requireResidentSession();

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const requests = await listResidentRequests(actor.resident.id);

    return { requests, serverTime: new Date().toISOString() };
  });
}
