import { z } from "zod";
import { DomainError, resubmitLetterRequest } from "@/db/commands";
import { getResidentCorrection } from "@/db/queries";
import { requireResidentSession } from "@/lib/auth/guard";
import { deleteAttachments, saveAttachment } from "@/lib/attachments";
import { letterAttachmentManifestSchema, MAX_ATTACHMENT_BYTES, uuidSchema } from "@/lib/validators";
import { withApi } from "../../../../_lib/respond";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: RouteContext<"/api/warga/requests/[id]/resubmission">) {
  return withApi(async () => {
    const actor = await requireResidentSession();
    const id = uuidSchema.parse((await ctx.params).id);
    const detail = await getResidentCorrection(actor.resident.villageId, actor.resident.id, id);
    if (!detail) throw new DomainError("Pengajuan tidak ditemukan.", "REQUEST_NOT_FOUND", 404);
    if (detail.status !== "BERKAS_TIDAK_LENGKAP") throw new DomainError("Pengajuan tidak menunggu perbaikan.", "INVALID_STATUS", 409);
    return detail;
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/warga/requests/[id]/resubmission">) {
  return withApi(async () => {
    const actor = await requireResidentSession();
    const id = uuidSchema.parse((await ctx.params).id);
    const detail = await getResidentCorrection(actor.resident.villageId, actor.resident.id, id);
    if (!detail) throw new DomainError("Pengajuan tidak ditemukan.", "REQUEST_NOT_FOUND", 404);
    if (detail.status !== "BERKAS_TIDAK_LENGKAP") throw new DomainError("Pengajuan tidak menunggu perbaikan.", "INVALID_STATUS", 409);
    if (!(request.headers.get("content-type") ?? "").includes("multipart/form-data"))
      throw new DomainError("Formulir berkas tidak valid.", "UNSUPPORTED_MEDIA_TYPE", 415);
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > 12 * MAX_ATTACHMENT_BYTES + 100_000) throw new DomainError("Ukuran formulir terlalu besar.", "TOO_LARGE", 413);
    // Enforce a streaming cap even when Content-Length is absent or dishonest.
    const reader = request.body?.getReader();
    if (!reader) throw new DomainError("Formulir berkas kosong.", "INVALID_BODY", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 12 * MAX_ATTACHMENT_BYTES + 100_000) {
        await reader.cancel();
        throw new DomainError("Ukuran formulir terlalu besar.", "TOO_LARGE", 413);
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    let form: FormData;
    try {
      form = await new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type")! }, body }).formData();
    } catch {
      throw new DomainError("Formulir berkas tidak valid.", "INVALID_BODY", 400);
    }
    if (form.getAll("version").length !== 1) throw new DomainError("Versi pengajuan tidak valid.", "INVALID_BODY", 422);
    const version = z.iso.datetime().parse(form.get("version"));
    const files: { docKey: string; file: File; manifest: z.infer<typeof letterAttachmentManifestSchema> }[] = [];
    for (const [key, value] of form.entries()) {
      if (key === "version" && typeof value === "string") continue;
      if (!key.startsWith("file:") || !(value instanceof File)) throw new DomainError("Kolom formulir tidak dikenal.", "INVALID_FIELD", 422);
      const docKey = key.slice(5);
      const manifest = letterAttachmentManifestSchema.parse({ docKey, fileName: value.name, mimeType: value.type, sizeBytes: value.size });
      files.push({ docKey, file: value, manifest });
    }
    if (!files.length || files.length > 12 || new Set(files.map((f) => f.docKey)).size !== files.length)
      throw new DomainError("Jumlah berkas tidak valid atau berkas dikirim dua kali.", "INVALID_ATTACHMENTS", 422);
    if (version !== detail.version || files.length !== detail.documents.length || files.some((f) => !detail.documents.some((d) => d.docKey === f.docKey)))
      throw new DomainError("Daftar berkas berubah atau belum lengkap. Segarkan halaman.", "STALE_REQUEST", 409);
    const storedKeys: string[] = [];
    try {
      const attachments = [];
      for (const { docKey, file, manifest } of files) {
        const data = new Uint8Array(await file.arrayBuffer());
        const valid = manifest.mimeType === "application/pdf" ? data.length >= 5 && data.slice(0, 5).every((v, i) => v === [37, 80, 68, 70, 45][i])
          : manifest.mimeType === "image/png" ? data.slice(0, 8).every((v, i) => v === [137, 80, 78, 71, 13, 10, 26, 10][i]) && data.length >= 8
          : data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255;
        if (!valid) throw new DomainError("Isi berkas tidak sesuai dengan formatnya.", "INVALID_FILE", 422);
        const { storageKey } = await saveAttachment({ villageId: actor.resident.villageId, requestId: id, docKey, mimeType: manifest.mimeType, data });
        storedKeys.push(storageKey);
        attachments.push({ ...manifest, storageKey });
      }
      return await resubmitLetterRequest({ villageId: actor.resident.villageId, residentId: actor.resident.id, requestId: id, version, attachments });
    } catch (error) {
      await deleteAttachments(storedKeys);
      throw error;
    }
  });
}
