import { getShellPayload } from "@/db/queries";
import { DomainError } from "@/db/commands";
import { requireStaffSession } from "@/lib/auth/guard";

import { withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * The dashboard shell — village identity, the *logged-in* officer, counts and
 * notifications. Requires a staff session; residents get a 403 and never see
 * the officer roster or notification stream.
 */
export async function GET() {
  return withApi(async () => {
    await requireStaffSession();

    const payload = await getShellPayload();
    if (!payload) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }
    return payload;
  });
}
