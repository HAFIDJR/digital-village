import { getShellPayload } from "@/db/queries";
import { DomainError } from "@/db/commands";

import { withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";
export async function GET() {
  return withApi(async () => {
    const payload = await getShellPayload();
    if (!payload) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }
    return payload;
  });
}