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

export { errorResponse };
