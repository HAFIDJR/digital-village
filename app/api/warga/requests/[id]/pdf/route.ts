import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { DomainError, recordResidentDownload } from "@/db/commands";
import { ensureDatabaseReady } from "@/db/bootstrap";
import { getRequestDetail, getVillageProfile } from "@/db/queries";
import { requireResidentSession } from "@/lib/auth/guard";
import { renderLetterPdf } from "@/lib/pdf/letter";
import { toFieldErrors } from "@/lib/validators";

export const dynamic = "force-dynamic";

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}

/**
 * Resident download of their own finished letter.
 *
 * Three gates, in order: a resident session, ownership of the request, and a
 * completed signature. Drafts of unsigned letters stay behind the counter —
 * only the signed final PDF ever leaves through the portal.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/warga/requests/[id]/pdf">) {
  const { id } = await ctx.params;

  try {
    await ensureDatabaseReady();

    const actor = await requireResidentSession();
    const village = await getVillageProfile();
    if (!village) throw new DomainError("Profil desa belum tersedia.", "NOT_SEEDED", 503);

    const detail = await getRequestDetail(village.id, id);
    if (!detail) throw new DomainError("Pengajuan tidak ditemukan.", "REQUEST_NOT_FOUND", 404);

    if (detail.applicant.residentId !== actor.resident.id) {
      // Not the owner: indistinguishable from "does not exist", so the portal
      // cannot be used to probe other residents' ticket ids.
      throw new DomainError("Pengajuan tidak ditemukan.", "REQUEST_NOT_FOUND", 404);
    }

    if (!detail.signature?.signedAt) {
      throw new DomainError(
        "Surat belum selesai ditandatangani. Berkas final dapat diunduh setelah ditandatangani Kepala Desa.",
        "NOT_SIGNED",
        409,
      );
    }

    const verificationUrl = `${new URL(request.url).origin}/verifikasi/${detail.verificationCode}`;

    const pdf = await renderLetterPdf({
      mode: "copies",
      copies: 1,
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
      signed: {
        signedAt: detail.signature.signedAt,
        certificateSerial: detail.signature.certificateSerial,
        signerName: detail.signature.signerName ?? village.headName,
      },
    });

    await recordResidentDownload({
      villageId: village.id,
      requestId: detail.id,
      ticket: detail.ticket,
      verificationCode: detail.verificationCode,
      residentId: actor.resident.id,
      residentName: actor.resident.fullName,
    });

    const slug = detail.applicant.fullName.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();
    const fileName = `surat-${detail.ticket}-${slug}.pdf`;

    return new NextResponse(new Blob([toArrayBuffer(pdf)], { type: "application/pdf" }), {
      headers: {
        "Content-Type": "application/pdf",
        // attachment: this is the warga's personal copy, not a loket print.
        "Content-Disposition": `attachment; filename="${fileName}"`,
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
            message: "Parameter unduhan tidak valid.",
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
    console.error("[warga-pdf]", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Gagal membuat berkas PDF." } },
      { status: 500 },
    );
  }
}
