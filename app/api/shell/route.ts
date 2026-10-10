import { getShellPayload } from "@/db/queries";
import { DomainError } from "@/db/commands";

import { withApi } from "../_lib/respond";
import { requireStaffSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";
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