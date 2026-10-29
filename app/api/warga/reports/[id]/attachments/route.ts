import { DomainError, addReportAttachments } from "@/db/commands";
import { getVillageProfile } from "@/db/queries";
import { requireResidentSession } from "@/lib/auth/guard";
import { deleteAttachments, saveUpload } from "@/lib/attachments";

import { parseMultipartBody, withApi } from "../../../../_lib/respond";

export const dynamic = "force-dynamic";


export async function POST(
  request: Request,
  ctx: RouteContext<"/api/warga/reports/[id]/attachments">,
) {
  const { id } = await ctx.params;

  return withApi(async () => {
    const actor = await requireResidentSession();

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const { fields, files } = await parseMultipartBody(request);
    if (!files.length) {
      throw new DomainError(
        "Pilih minimal satu foto untuk ditambahkan.",
        "VALIDATION_ERROR",
        422,
      );
    }

    let hints: { width?: number; height?: number; caption?: string }[] = [];
    if (fields.attachments?.trim()) {
      try {
        const parsed: unknown = JSON.parse(fields.attachments);
        if (Array.isArray(parsed)) hints = parsed as never[];
      } catch {
        hints = [];
      }
    }

    const ordered = [...files].sort(
      (a, b) => Number(a.docKey) - Number(b.docKey) || a.docKey.localeCompare(b.docKey),
    );

    const storedKeys: string[] = [];
    try {
      const stored = [];
      for (let index = 0; index < ordered.length; index += 1) {
        const file = ordered[index];
        const hint = hints[index] ?? {};
        const { storageKey } = await saveUpload({
          villageId: village.id,
          scope: { collection: "reports", id },
          name: file.fileName,
          mimeType: file.mimeType,
          data: file.data,
        });
        storedKeys.push(storageKey);
        stored.push({
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          width: hint.width,
          height: hint.height,
          caption: hint.caption,
          storageKey,
        });
      }

      const result = await addReportAttachments({
        villageId: village.id,
        reportId: id,
        actor: { type: "RESIDENT", residentId: actor.resident.id },
        attachments: stored,
      });

      return {
        ok: true,
        reportId: result.reportId,
        ticket: result.ticket,
        attachmentCount: result.attachmentCount,
        attachments: result.attachments.map((row) => ({
          id: row.id,
          fileName: row.fileName,
          mimeType: row.mimeType,
          sizeBytes: row.sizeBytes,
          width: row.width,
          height: row.height,
          caption: row.caption,
          uploadedAt: row.uploadedAt,
        })),
      };
    } catch (error) {
      await deleteAttachments(storedKeys);
      throw error;
    }
  });
}