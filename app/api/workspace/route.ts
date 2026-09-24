import { getWorkspaceOverview } from "@/db/queries";
import { DomainError } from "@/db/commands";
import { parseQueueQuery } from "@/lib/validators";

import { withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * The dashboard's single read endpoint.
 *
 * One round trip returns the KPI row, the first page of the worklist, the audit
 * feed, notifications, reports and announcements — so the first paint is
 * consistent (no KPI card ever shows yesterday's figure beside today's table)
 * and the officer waits for one request rather than seven.
 */
export async function GET(request: Request) {
  // Parsing happens inside `withApi` so an invalid page size comes back as a
  // 422 with field-level detail rather than an unhandled ZodError.
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
