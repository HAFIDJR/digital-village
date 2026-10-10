import { randomUUID } from "node:crypto";

import { DomainError, createLetterRequest } from "@/db/commands";
import { getVillageProfile, listLetterRequests } from "@/db/queries";
import { requireResidentSession, requireStaffSession } from "@/lib/auth/guard";
import { deleteAttachments, saveAttachment } from "@/lib/attachments";
import { letterRequestDraftSchema, parseQueueQuery } from "@/lib/validators";

import { parseJsonField, parseMultipartBody, withApi } from "../_lib/respond";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  return withApi(async () => {
    await requireStaffSession();
    const query = parseQueueQuery(params);

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const page = await listLetterRequests(village.id, query);
    return { ...page, query, serverTime: new Date().toISOString() };
  });
}

/**
 * Online submission from the resident portal.
 *
 * The body is `multipart/form-data`: text fields plus one file per required
 * document named `file:<DOC_KEY>`. Storage keys are minted server-side, so a
 * client can never point a request at somebody else's scan.
 */
export async function POST(request: Request) {
  return withApi(async () => {
    const actor = await requireResidentSession();

    const village = await getVillageProfile();
    if (!village) {
      throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);
    }

    const { fields, files } = await parseMultipartBody(request);

    const draft = letterRequestDraftSchema.parse({
      letterTypeId: fields.letterTypeId,
      purpose: fields.purpose,
      channel: fields.channel ?? "WEBSITE",
      payload: parseJsonField(fields.payload),
      attachments: files.map(({ docKey, fileName, mimeType, sizeBytes }) => ({
        docKey,
        fileName,
        mimeType,
        sizeBytes,
      })),
    });

    // Reserve the id first so the scans can be stored under requests/<id>/….
    const requestId = randomUUID();
    const storedKeys: string[] = [];
    const storedAttachments: {
      docKey: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      storageKey: string;
    }[] = [];

    try {
      for (const file of files) {
        const manifest = draft.attachments.find((a) => a.docKey === file.docKey);
        if (!manifest) continue;
        const { storageKey } = await saveAttachment({
          villageId: village.id,
          requestId,
          docKey: file.docKey,
          mimeType: file.mimeType,
          data: file.data,
        });
        storedKeys.push(storageKey);
        storedAttachments.push({ ...manifest, storageKey });
      }

      const row = await createLetterRequest({
        villageId: village.id,
        residentId: actor.resident.id,
        requestId,
        draft: { ...draft, attachments: storedAttachments },
      });

      return {
        ok: true,
        request: {
          id: row.id,
          ticket: row.ticket,
          status: row.status,
          channel: row.channel,
          documentsUploaded: row.documentsUploaded,
          documentsRequired: row.documentsRequired,
          submittedAt: row.submittedAt,
          dueAt: row.dueAt,
        },
      };
    } catch (error) {
      // The database write rolled back — do not leave orphaned scans behind.
      await deleteAttachments(storedKeys);
      throw error;
    }
  });
}
