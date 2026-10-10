import "server-only";

import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { DomainError } from "@/db/commands";
import { ensureDatabaseReady } from "@/db/bootstrap";
import { toFieldErrors } from "@/lib/validators";

export type ApiErrorPayload = {
  error: { code: string; message: string; fields?: Record<string, string[]> };
};

function errorResponse(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string[]>,
) {
  const payload: ApiErrorPayload = {
    error: { code, message, ...(fields ? { fields } : {}) },
  };
  return NextResponse.json(payload, { status });
}

function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return errorResponse(
      422,
      "VALIDATION_ERROR",
      "Data yang dikirim belum lengkap atau tidak valid.",
      toFieldErrors(error),
    );
  }
  if (error instanceof DomainError) {
    return errorResponse(error.status, error.code, error.message);
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error("[api]", message);
  return errorResponse(
    500,
    "INTERNAL_ERROR",
    "Terjadi kesalahan pada server. Silakan coba lagi.",
  );
}

export async function withApi<T>(
  handler: () => Promise<T>,
): Promise<NextResponse> {
  try {
    await ensureDatabaseReady();
    const data = await handler();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Same contract as `withApi`, for handlers that answer with their own
 * `Response` (streamed files, PDFs) instead of a JSON body.
 */
export async function withApiRaw(
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    await ensureDatabaseReady();
    return await handler();
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function parseBody<S extends ZodType>(
  schema: S,
  request: Request,
): Promise<ReturnType<S["parse"]>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }
  return schema.parse(payload) as ReturnType<S["parse"]>;
}

export function parseSearchParams<S extends ZodType>(
  schema: S,
  request: Request,
): ReturnType<S["parse"]> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return schema.parse(params) as ReturnType<S["parse"]>;
}

/** Field name that carries an uploaded scan, e.g. `file:KTP` for the KTP scan. */
const FILE_FIELD_PREFIX = "file:";

export type UploadedFile = {
  docKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  data: Uint8Array;
};

/**
 * Reads a `multipart/form-data` body into plain text fields plus the uploaded
 * scans. Every file must be named `file:<DOC_KEY>` so the document type comes
 * from the form contract rather than from client-supplied metadata.
 */
export async function parseMultipartBody(
  request: Request,
): Promise<{ fields: Record<string, string>; files: UploadedFile[] }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw new DomainError(
      "Permintaan harus dikirim sebagai formulir berkas (multipart/form-data).",
      "UNSUPPORTED_MEDIA_TYPE",
      415,
    );
  }

  const form = await request.formData();
  const fields: Record<string, string> = {};
  const files: UploadedFile[] = [];

  for (const [key, value] of form.entries()) {
    if (value instanceof File) {
      if (!key.startsWith(FILE_FIELD_PREFIX)) {
        throw new DomainError(
          "Nama kolom berkas tidak dikenal. Gunakan format file:<JENIS_BERKAS>.",
          "UNKNOWN_FILE_FIELD",
          422,
        );
      }
      files.push({
        docKey: key.slice(FILE_FIELD_PREFIX.length).trim().toUpperCase(),
        fileName: value.name || "berkas",
        mimeType: value.type || "application/octet-stream",
        sizeBytes: value.size,
        data: new Uint8Array(await value.arrayBuffer()),
      });
      continue;
    }
    fields[key] = value;
  }

  return { fields, files };
}

/** Free-form template variables arrive as a JSON string in a multipart form. */
export function parseJsonField(
  value: string | undefined,
): Record<string, string | number | null> {
  if (!value || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string | number | null>;
    }
  } catch {
    // falls through to the shared error below
  }
  throw new DomainError(
    "Isian tambahan surat tidak valid.",
    "INVALID_PAYLOAD",
    422,
  );
}

export { errorResponse };
