import { NextResponse } from "next/server";

import { DomainError, removeReportAttachment } from "@/db/commands";
import { getReportAttachmentFile, getVillageProfile } from "@/db/queries";
import { requireStaffCapability } from "@/lib/auth/guard";
import { ATTACHMENT_KEY_PREFIX, deleteAttachments, readAttachment } from "@/lib/attachments";

import { withApi, withApiRaw } from "../../../../_lib/respond";

export const dynamic = "force-dynamic";

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/reports/[id]/attachments/[attachmentId]">,
) {
  const { id, attachmentId } = await ctx.params;

  return withApiRaw(async () => {
    await requireStaffCapability("verify");

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const attachment = await getReportAttachmentFile(village.id, id, attachmentId);
    if (!attachment) {
      throw new DomainError("Foto tidak ditemukan.", "ATTACHMENT_NOT_FOUND", 404);
    }

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
        "Foto tidak lagi tersedia pada penyimpanan desa.",
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

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/reports/[id]/attachments/[attachmentId]">,
) {
  const { id, attachmentId } = await ctx.params;

  return withApi(async () => {
    const { officer } = await requireStaffCapability("verify");

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const removed = await removeReportAttachment({
      villageId: village.id,
      reportId: id,
      attachmentId,
      actor: { type: "STAFF", staffId: officer.id },
    });

    await deleteAttachments([removed.storageKey]);

    return {
      ok: true,
      reportId: removed.reportId,
      attachmentCount: removed.attachmentCount,
    };
  });
}