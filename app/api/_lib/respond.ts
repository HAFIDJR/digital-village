import "server-only";

import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { DomainError } from "@/db/commands";
import { ensureDatabaseReady } from "@/db/bootstrap";
import { toFieldErrors } from "@/lib/validators";

/**
 * Shared plumbing for every route handler.
 *
 * Three guarantees it provides, so no individual handler has to remember them:
 *  1. the database is migrated and seeded before a query runs;
 *  2. request payloads are parsed with the shared Zod schema *before* any
 *     domain code sees them — a 422 with field-level messages comes back
 *     instead of a 500 from deep inside SQL;
 *  3. every thrown error is normalised into one JSON envelope shape that the
 *     RTK Query baseQuery knows how to surface.
 */

export type ApiErrorPayload = {
  error: { code: string; message: string; fields?: Record<string, string[]> };
};

function errorResponse(
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string[]>,
) {
  const payload: ApiErrorPayload = { error: { code, message, ...(fields ? { fields } : {}) } };
  return NextResponse.json(payload, { status });
}

/** Wraps a handler with bootstrapping and uniform error translation. */
export async function withApi<T>(handler: () => Promise<T>): Promise<NextResponse> {
  try {
    await ensureDatabaseReady();
    const data = await handler();
    return NextResponse.json(data, {
      headers: {
        // Operational data is per-officer and changes second to second.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return errorResponse(422, "VALIDATION_ERROR", "Data yang dikirim belum lengkap atau tidak valid.", toFieldErrors(error));
    }
    if (error instanceof DomainError) {
      return errorResponse(error.status, error.code, error.message);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api]", message);
    return errorResponse(500, "INTERNAL_ERROR", "Terjadi kesalahan pada server. Silakan coba lagi.");
  }
}

/** Parses a JSON body, or a search-params object, against a Zod schema. */
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

/**
 * Parses query-string parameters against a Zod object schema.
 *
 * `URLSearchParams` is converted to a plain record first: Zod inspects own
 * enumerable properties, and a URLSearchParams instance exposes none — passing
 * it straight through makes every field look absent.
 */
export function parseSearchParams<S extends ZodType>(
  schema: S,
  request: Request,
): ReturnType<S["parse"]> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return schema.parse(params) as ReturnType<S["parse"]>;
}

export { errorResponse };
