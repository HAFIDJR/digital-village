import { getActiveOfficer, getVillageProfile } from "@/db/queries";
import { DomainError, verifyLetterRequest } from "@/db/commands";
import { verifyRequestSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * Officer decision on a queue row: setujui / minta perbaikan / tolak.
 *
 * Per-document verdicts are accepted in the same call so the drawer can record
 * "KTP Buram" and the decision atomically — one transaction, one audit entry.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/requests/[id]/verify">) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const payload = await parseBody(verifyRequestSchema, request);

    const village = await getVillageProfile();
    if (!village) throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);

    const officer = await getActiveOfficer(village.id);
    if (!officer) throw new DomainError("Tidak ada petugas aktif pada shift ini.", "NO_ACTIVE_STAFF", 409);

    const result = await verifyLetterRequest({
      villageId: village.id,
      requestId: id,
      staffId: officer.id,
      payload,
    });

    return {
      ok: true,
      ticket: result.request.ticket,
      previousStatus: result.previousStatus,
      status: result.request.status,
      defectiveCount: result.defectiveCount,
      letterTypeName: result.letterTypeName,
    };
  });
}
