import { getVillageProfile } from "@/db/queries";
import { DomainError, signLetterRequest } from "@/db/commands";
import { signRequestSchema } from "@/lib/validators";
import { requireStaffOfficer } from "@/lib/auth/guard";

import { parseBody, withApi } from "../../../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * The signature ceremony.
 *
 * The signer is *always* the staff member behind the session — never "the
 * first canSign staff found" — so a signature is attributable to the account
 * that typed the passphrase. Everyone else, including operators who know the
 * passphrase, is refused here.
 */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/requests/[id]/sign">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const payload = await parseBody(signRequestSchema, request);

    const village = await getVillageProfile();
    if (!village)
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);

    const { officer } = await requireStaffOfficer();

    if (!officer.canSign) {
      throw new DomainError(
        "Hanya Kepala Desa selaku pejabat penanda tangan yang dapat menandatangani surat. Teruskan berkas ke agenda tanda tangan untuk diproses.",
        "NOT_AUTHORISED_SIGNER",
        403,
      );
    }

    const result = await signLetterRequest({
      villageId: village.id,
      requestId: id,
      staffId: officer.id,
      passphrase: payload.passphrase,
      certificateSerial: payload.certificateSerial,
    });

    return {
      ok: true,
      ticket: result.request.ticket,
      status: result.request.status,
      certificateSerial: result.certificateSerial,
      signerName: officer.fullName,
      signedAt: result.request.signedAt,
    };
  });
}
