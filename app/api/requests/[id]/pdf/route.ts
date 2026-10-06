import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { DomainError, recordPrintRun } from "@/db/commands";
import { ensureDatabaseReady } from "@/db/bootstrap";
import { getActiveOfficer, getRequestDetail, getVillageProfile } from "@/db/queries";
import { renderLetterPdf } from "@/lib/pdf/letter";
import { printRequestSchema, toFieldErrors } from "@/lib/validators";

export const dynamic = "force-dynamic";

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}

export async function GET(request: Request, ctx: RouteContext<"/api/requests/[id]/pdf">) {
  const { id } = await ctx.params;

  try {
    await ensureDatabaseReady();

    const { mode, copies } = printRequestSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );

    const village = await getVillageProfile();
    if (!village) throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);

    const officer = await getActiveOfficer(village.id);
    if (!officer) {
      throw new DomainError("Tidak ada petugas aktif pada shift ini.", "NO_ACTIVE_STAFF", 409);
    }

    const detail = await getRequestDetail(village.id, id);
    if (!detail) throw new DomainError("Pengajuan tidak ditemukan.", "REQUEST_NOT_FOUND", 404);
    if (mode === "final" && !detail.signature?.signedAt) {
      throw new DomainError(
        "Surat belum ditandatangani. Cetak sebagai draf terlebih dahulu.",
        "NOT_SIGNED",
        409,
      );
    }

    const verificationUrl = `${new URL(request.url).origin}/verifikasi/${detail.verificationCode}`;

    const pdf = await renderLetterPdf({
      mode: mode === "final" ? "copies" : "draft",
      copies,
      verificationUrl,
      village,
      request: {
        ticket: detail.ticket,
        agendaNumber: detail.agendaNumber,
        verificationCode: detail.verificationCode,
        submittedAt: detail.submittedAt,
        purpose: detail.purpose,
        templateTitle: detail.letter.templateTitle,
        letterName: detail.letter.name,
        letterCode: detail.letter.code,
        feeIdr: detail.letter.feeIdr,
      },
      applicant: {
        fullName: detail.applicant.fullName,
        nik: detail.applicant.nik,
        birthPlace: detail.applicant.birthPlace,
        birthDate: detail.applicant.birthDate,
        gender: detail.applicant.gender,
        religion: detail.applicant.religion,
        maritalStatus: detail.applicant.maritalStatus,
        occupation: detail.applicant.occupation,
        nationality: detail.applicant.nationality,
        address: detail.applicant.address,
        familyRelation: detail.applicant.familyRelation,
        kkNumber: detail.family.kkNumber,
        familyHead: detail.family.headName,
      },
      location: detail.location,
      payload: detail.payload,
      signed: detail.signature?.signedAt
        ? {
            signedAt: detail.signature.signedAt,
            certificateSerial: detail.signature.certificateSerial,
            signerName: detail.signature.signerName ?? village.headName,
          }
        : null,
    });

    await recordPrintRun({
      villageId: village.id,
      requestId: detail.id,
      staffId: officer.id,
      mode,
      copies,
    });

    const slug = detail.applicant.fullName.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();
    const fileName = `${mode === "final" ? "surat" : "draf"}-${detail.ticket}-${slug}.pdf`;

    return new NextResponse(new Blob([toArrayBuffer(pdf)], { type: "application/pdf" }), {
      headers: {
        "Content-Type": "application/pdf",
        // inline so the officer can review it in the browser's PDF viewer,
        // with `download` preserved for the "Save as" flow.
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Parameter cetak tidak valid.",
            fields: toFieldErrors(error),
          },
        },
        { status: 422 },
      );
    }
    if (error instanceof DomainError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    console.error("[pdf]", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Gagal membuat berkas PDF." } },
      { status: 500 },
    );
  }
}