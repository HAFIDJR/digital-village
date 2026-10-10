import { NextResponse } from "next/server";

import { DomainError } from "@/db/commands";
import { getAttachmentFile, getVillageProfile } from "@/db/queries";
import { requireStaffSession } from "@/lib/auth/guard";
import { ATTACHMENT_KEY_PREFIX, readAttachment } from "@/lib/attachments";

import { withApiRaw } from "../../../../_lib/respond";

export const dynamic = "force-dynamic";

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}

/**
 * Streams an uploaded scan back to the verifying officer. The `storage_key`
 * stays on the server; only the bytes cross the wire.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/requests/[id]/attachments/[attachmentId]">,
) {
  const { id, attachmentId } = await ctx.params;

  return withApiRaw(async () => {
    await requireStaffSession();

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const attachment = await getAttachmentFile(village.id, id, attachmentId);
    if (!attachment) {
      throw new DomainError("Berkas tidak ditemukan.", "ATTACHMENT_NOT_FOUND", 404);
    }

    // Seeded demo rows carry an object-store key with no bytes behind them.
    if (!attachment.storageKey.startsWith(`${ATTACHMENT_KEY_PREFIX}/`)) {
      throw new DomainError(
        "Berkas contoh tidak tersedia untuk diunduh.",
        "ATTACHMENT_NOT_STORED",
        404,
      );
    }

    const data = await readAttachment(attachment.storageKey);
    if (!data) {
      throw new DomainError(
        "Berkas tidak lagi tersedia pada penyimpanan desa.",
        "ATTACHMENT_MISSING",
        404,
      );
    }

    return new NextResponse(new Blob([toArrayBuffer(data)], { type: attachment.mimeType }), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(data.byteLength),
        "Content-Disposition": `inline; filename="${attachment.fileName.replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  });
}
