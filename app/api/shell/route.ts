import { getShellPayload } from "@/db/queries";
import { DomainError } from "@/db/commands";

import { withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * Chrome payload for every route: village identity, acting officer, shift,
 * notification bell and the rail's badge counts.
 *
 * Split out from `/api/workspace` so a route that only needs the header does
 * not drag the whole letter worklist along with it.
 */
export async function GET() {
  return withApi(async () => {
    const payload = await getShellPayload();
    if (!payload) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }
    return payload;
  });
}
