import { getRequestDetail, getVillageProfile } from "@/db/queries";
import { DomainError } from "@/db/commands";

import { withApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

/** Full dossier for the slide-over drawer: resident, files, signature, timeline. */
export async function GET(_request: Request, ctx: RouteContext<"/api/requests/[id]">) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const village = await getVillageProfile();
    if (!village) throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);

    const detail = await getRequestDetail(village.id, id);
    if (!detail) throw new DomainError("Pengajuan tidak ditemukan.", "REQUEST_NOT_FOUND", 404);

    return detail;
  });
}
