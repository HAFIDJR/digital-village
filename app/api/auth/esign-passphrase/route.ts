import { activateSignaturePassphrase, DomainError } from "@/db/commands";
import { requireStaffSession } from "@/lib/auth/guard";
import { esignPassphraseSchema } from "@/lib/validators";

import { parseBody, withApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * "Aktivasi Sertifikat Tanda Tangan" — self-service activation/rotation of
 * the signer's own e-sign passphrase, while logged in as that signer.
 *
 * Only a `canSign` staff member may call it, and only for themselves: the
 * staff id always comes from the session, never from the request body.
 */
export async function POST(request: Request) {
  return withApi(async () => {
    const payload = await parseBody(esignPassphraseSchema, request);
    const actor = await requireStaffSession();

    if (!actor.staff.canSign) {
      throw new DomainError(
        "Hanya Kepala Desa selaku pejabat penanda tangan yang dapat mengaktivasi sertifikat tanda tangan.",
        "NOT_AUTHORISED_SIGNER",
        403,
      );
    }

    const result = await activateSignaturePassphrase({
      villageId: actor.staff.villageId,
      staffId: actor.staff.id,
      currentPassphrase: payload.currentPassphrase,
      newPassphrase: payload.newPassphrase,
    });

    return {
      ok: true as const,
      activated: result.activated,
      rotated: result.rotated,
    };
  });
}
