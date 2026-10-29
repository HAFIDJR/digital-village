import { randomUUID } from "node:crypto";

import { DomainError, createCitizenReport } from "@/db/commands";
import { getVillageProfile, listReports } from "@/db/queries";
import { getCurrentActor } from "@/lib/auth/session";
import { deleteAttachments, saveUpload } from "@/lib/attachments";
import { parseReportQuery, reportDraftSchema } from "@/lib/validators";

import { parseBody, parseMultipartBody, withApi } from "../_lib/respond";
import { requireStaffSession } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  return withApi(async () => {
    await requireStaffSession();
    const query = parseReportQuery(params);

    const village = await getVillageProfile();

    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }
    const page = await listReports(village.id, query);

    return {
      ...page,
      query,
      serverTime: new Date().toISOString(),
    };
  });
}

function parseAttachmentHints(value: string | undefined): {
  width?: number;
  height?: number;
  caption?: string;
}[] {
  if (!value || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed as never[];
  } catch {
    // fall through — hints are optional decoration, not the source of truth
  }
  return [];
}

export async function POST(request: Request) {
  return withApi(async () => {
    const actor = await getCurrentActor();
    if (!actor) {
      throw new DomainError(
        "Sesi tidak ditemukan atau telah berakhir. Silakan masuk kembali.",
        "UNAUTHENTICATED",
        401,
      );
    }

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const contentType = request.headers.get("content-type") ?? "";
    const isMultipart = contentType.includes("multipart/form-data");

    let draft: import("@/lib/validators").ReportDraft;
    let files: { fileName: string; mimeType: string; data: Uint8Array }[] = [];

    if (isMultipart) {
      const { fields, files: uploaded } = await parseMultipartBody(request);
      const hints = parseAttachmentHints(fields.attachments);

      // Files arrive keyed file:<index>; sort numerically so hint order matches.
      const ordered = [...uploaded].sort((a, b) =>
        Number(a.docKey) - Number(b.docKey) || a.docKey.localeCompare(b.docKey),
      );
      files = ordered.map((file) => ({
        fileName: file.fileName,
        mimeType: file.mimeType,
        data: file.data,
      }));

      draft = reportDraftSchema.parse({
        category: fields.category,
        subject: fields.subject,
        body: fields.body,
        priority: fields.priority || undefined,
        neighborhoodId: fields.neighborhoodId || undefined,
        reporter: fields.reporter ? JSON.parse(fields.reporter) : undefined,
        attachments: ordered.map((file, index) => ({
          fileName: file.fileName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          width: hints[index]?.width,
          height: hints[index]?.height,
          caption: hints[index]?.caption,
        })),
      });
    } else {
      draft = await parseBody(reportDraftSchema, request);
      files = [];
    }

    const reportId = randomUUID();
    const storedKeys: string[] = [];

    try {
      const storedAttachments = [];
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const manifest = draft.attachments[index];
        const { storageKey } = await saveUpload({
          villageId: village.id,
          scope: { collection: "reports", id: reportId },
          name: file.fileName,
          mimeType: file.mimeType,
          data: file.data,
        });
        storedKeys.push(storageKey);
        storedAttachments.push({ ...manifest, storageKey });
      }

      const report = await createCitizenReport({
        villageId: village.id,
        residentId: actor.type === "RESIDENT" ? actor.resident.id : null,
        staffId: actor.type === "STAFF" ? actor.staff.id : null,
        reportId,
        draft: { ...draft, attachments: storedAttachments },
      });

      return {
        ok: true,
        report: {
          id: report.id,
          ticket: report.ticket,
          category: report.category,
          subject: report.subject,
          status: report.status,
          priority: report.priority,
          attachmentCount: report.attachmentCount,
          submittedAt: report.submittedAt,
        },
      };
    } catch (error) {
      await deleteAttachments(storedKeys);
      throw error;
    }
  });
}