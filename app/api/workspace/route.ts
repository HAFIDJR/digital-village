import { getWorkspaceOverview } from "@/db/queries";
import { DomainError } from "@/db/commands";
import { parseQueueQuery } from "@/lib/validators";

import { withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  return withApi(async () => {
    const query = parseQueueQuery(params);

    const overview = await getWorkspaceOverview(query);
    if (!overview) {
      throw new DomainError(
        "Data desa belum tersedia. Jalankan `npm run db:reset` untuk membangun ulang basis data.",
        "NOT_SEEDED",
        503,
      );
    }
    return overview;
  });
}