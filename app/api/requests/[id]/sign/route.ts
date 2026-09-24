import { getVillageProfile } from "@/db/queries";
import { DomainError, signLetterRequest } from "@/db/commands";
import { signRequestSchema } from "@/lib/validators";
import { getDb } from "@/db/client";
import { and, eq } from "drizzle-orm";
import * as t from "@/db/schema";

import { parseBody, withApi } from "../../../_lib/respond";

export const dynamic = "force-dynamic";

/**
 * Electronic signature ceremony.
 *
 * Scoped to the officer who holds `can_sign` (the Kepala Desa) rather than the
 * shift's default officer, because signing is a personal act of authority — the
 * domain layer re-checks `can_sign` regardless of what this route resolves.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/requests/[id]/sign">) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const payload = await parseBody(signRequestSchema, request);

    const village = await getVillageProfile();
    if (!village) throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);

    const db = await getDb();
    const [signer] = await db
      .select()
      .from(t.staff)
      .where(and(eq(t.staff.villageId, village.id), eq(t.staff.canSign, true), eq(t.staff.active, true)))
      .limit(1);

    if (!signer) {
      throw new DomainError("Pejabat penanda tangan belum dikonfigurasi.", "NO_SIGNER", 409);
    }

    const result = await signLetterRequest({
      villageId: village.id,
      requestId: id,
      staffId: signer.id,
      passphrase: payload.passphrase,
      certificateSerial: payload.certificateSerial,
    });

    return {
      ok: true,
      ticket: result.request.ticket,
      status: result.request.status,
      certificateSerial: result.certificateSerial,
      signerName: signer.fullName,
      signedAt: result.request.signedAt,
    };
  });
}
