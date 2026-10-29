import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "./client";
import * as t from "./schema";
import type {
  AnnouncementDraft,
  AnnouncementUpdate,
  FamilyDraft,
  FamilyUpdate,
  HamletDraft,
  HamletUpdate,
  LetterAttachmentManifest,
  LetterRequestDraft,
  NeighborhoodDraft,
  NeighborhoodUpdate,
  ReportAttachmentManifest,
  ReportDraft,
  ReportUpdate,
  ResidentAccountDraft,
  ResidentDraft,
  ResidentUpdate,
  VerifyRequestInput,
} from "@/lib/validators";
import {
  ANNOUNCEMENT_STATUS,
  MUTATION_KIND,
  REPORT_CATEGORY,
  REPORT_STATUS,
  REQUEST_STATUS,
  isReportEditable,
  notificationSeverity,
} from "@/lib/domain";
import { MAX_REPORT_IMAGES } from "@/lib/validators";
import { initialsOf } from "@/lib/format";
import { verifyPassword } from "@/lib/auth/password";
import { hashPassword } from "@/lib/auth/password";
import {
  LOCKOUT_MS,
  MAX_SIGN_ATTEMPTS,
  lockoutMinutesLeft,
} from "@/lib/auth/policy";
import type { RequestStatus } from "./schema";


type Db = Awaited<ReturnType<typeof getDb>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbOrTx = Db | Tx;

export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

const TICKET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateVerificationCode() {
  let out = "";
  for (let i = 0; i < 12; i += 1) {
    out += TICKET_ALPHABET[Math.floor(Math.random() * TICKET_ALPHABET.length)];
  }
  return out;
}

/** Tickets start above the seeded block so demo data and live filings never collide. */
const TICKET_BASE = 1000;

async function nextTicket(
  tx: DbOrTx,
  table: "letter_requests" | "citizen_reports",
  prefix: "SRT" | "LPR",
): Promise<string> {
  const result = await tx.execute<{ next: number }>(sql`
    select coalesce(max(nullif(substring(ticket from '[0-9]+$'), '')::int), ${TICKET_BASE}) + 1 as next
    from ${sql.raw(table)}
    where ticket like ${`${prefix}-%`}
  `);
  return `${prefix}-${result.rows[0]?.next ?? TICKET_BASE + 1}`;
}

/** Agenda number from the village registry book, continued monotonically. */
async function nextAgendaNumber(tx: DbOrTx): Promise<number> {
  const result = await tx.execute<{ next: number }>(sql`
    select coalesce(max(agenda_number), 400) + 1 as next from letter_requests
  `);
  return result.rows[0]?.next ?? 401;
}

async function loadResident(tx: DbOrTx, villageId: string, residentId: string) {
  const [row] = await tx
    .select()
    .from(t.residents)
    .where(and(eq(t.residents.id, residentId), eq(t.residents.villageId, villageId)))
    .limit(1);
  if (!row) throw new DomainError("Penduduk tidak ditemukan", "RESIDENT_NOT_FOUND", 404);
  return row;
}

/** Guards against a neighbourhood uuid belonging to another village. */
async function loadNeighborhood(tx: DbOrTx, villageId: string, neighborhoodId: string) {
  const [row] = await tx
    .select({
      id: t.neighborhoods.id,
      rt: t.neighborhoods.rt,
      rw: t.neighborhoods.rw,
      hamletId: t.neighborhoods.hamletId,
      hamletName: t.hamlets.name,
    })
    .from(t.neighborhoods)
    .innerJoin(t.hamlets, eq(t.hamlets.id, t.neighborhoods.hamletId))
    .where(and(eq(t.neighborhoods.id, neighborhoodId), eq(t.hamlets.villageId, villageId)))
    .limit(1);
  if (!row) throw new DomainError("Wilayah RT/RW tidak ditemukan", "NEIGHBORHOOD_NOT_FOUND", 404);
  return row;
}

async function loadFamily(tx: DbOrTx, villageId: string, familyId: string) {
  const [row] = await tx
    .select()
    .from(t.families)
    .where(and(eq(t.families.id, familyId), eq(t.families.villageId, villageId)))
    .limit(1);
  if (!row) throw new DomainError("Kartu keluarga tidak ditemukan", "FAMILY_NOT_FOUND", 404);
  return row;
}

async function syncFamilyMemberCount(tx: DbOrTx, familyId: string) {
  await tx
    .update(t.families)
    .set({
      memberCount: sql`(select count(*)::int from residents
                          where family_id = ${familyId} and status = 'AKTIF')`,
      updatedAt: new Date(),
    })
    .where(eq(t.families.id, familyId));
}

async function notifyOfficers(
  tx: DbOrTx,
  villageId: string,
  entry: {
    title: string;
    body: string;
    severity: string;
    href: string;
    subjectType?: string | null;
    subjectId?: string | null;
    subjectRef?: string | null;
    meta?: Record<string, unknown>;
  },
) {
  await tx.insert(t.notifications).values({
    villageId,
    recipientStaffId: null,
    title: entry.title,
    body: entry.body,
    severity: entry.severity,
    href: entry.href,
    subjectType: entry.subjectType ?? null,
    subjectId: entry.subjectId ?? null,
    subjectRef: entry.subjectRef ?? null,
    meta: entry.meta ?? {},
  });
}

/** Structured audit entry — the shape every mutation writes. */
type AuditEntry = {
  kind: (typeof t.activityKindEnum.enumValues)[number];
  summary: string;
  subjectType?: string | null;
  subjectId?: string | null;
  subjectRef?: string | null;
  actor: {
    id: string | null;
    name: string;
    initials: string;
    role: string;
  };
  meta?: Record<string, unknown>;
};

type AuditWriter = { insert: Db["insert"] };

async function writeAudit(tx: AuditWriter, villageId: string, entry: AuditEntry) {
  await tx.insert(t.activityLog).values({
    villageId,
    kind: entry.kind,
    summary: entry.summary,
    subjectType: entry.subjectType ?? null,
    subjectId: entry.subjectId ?? null,
    subjectRef: entry.subjectRef ?? null,
    actorStaffId: entry.actor.id,
    actorName: entry.actor.name,
    actorInitials: entry.actor.initials,
    actorRole: entry.actor.role,
    meta: entry.meta ?? {},
  });
}

export async function appendAudit(villageId: string, entry: AuditEntry) {
  const db = await getDb();
  await writeAudit(db, villageId, entry);
}

export async function openStaffShift(input: {
  staffId: string;
  station: string;
  ipAddress?: string | null;
}) {
  const db = await getDb();
  const [open] = await db
    .select({ id: t.staffShifts.id })
    .from(t.staffShifts)
    .where(and(eq(t.staffShifts.staffId, input.staffId), isNull(t.staffShifts.endedAt)))
    .limit(1);
  if (open) return { reopened: false as const, shiftId: open.id };

  const [shift] = await db
    .insert(t.staffShifts)
    .values({
      staffId: input.staffId,
      station: input.station,
      ipAddress: input.ipAddress ?? null,
    })
    .returning({ id: t.staffShifts.id });
  return { reopened: true as const, shiftId: shift.id };
}

export async function closeOpenStaffShifts(staffId: string) {
  const db = await getDb();
  await db
    .update(t.staffShifts)
    .set({ endedAt: new Date() })
    .where(and(eq(t.staffShifts.staffId, staffId), isNull(t.staffShifts.endedAt)));
}

async function resetSignAttempts(db: Db, staffId: string) {
  await db
    .update(t.staff)
    .set({ signAttempts: 0, signLockedUntil: null })
    .where(eq(t.staff.id, staffId));
}

async function registerFailedSignAttempt(db: Db, staff: t.Staff) {
  const attempts = (staff.signAttempts ?? 0) + 1;
  const locked = attempts >= MAX_SIGN_ATTEMPTS;
  await db
    .update(t.staff)
    .set({
      signAttempts: attempts,
      ...(locked ? { signLockedUntil: new Date(Date.now() + LOCKOUT_MS) } : {}),
    })
    .where(eq(t.staff.id, staff.id));
  return { attempts, locked };
}

async function loadStaff(tx: DbOrTx, staffId: string) {
  const [row] = await tx.select().from(t.staff).where(eq(t.staff.id, staffId)).limit(1);
  if (!row) throw new DomainError("Petugas tidak ditemukan", "STAFF_NOT_FOUND", 404);
  if (!row.active) throw new DomainError("Akun petugas tidak aktif", "STAFF_INACTIVE", 403);
  return row;
}

async function loadRequest(tx: DbOrTx, villageId: string, requestId: string) {
  const [row] = await tx
    .select()
    .from(t.letterRequests)
    .where(and(eq(t.letterRequests.id, requestId), eq(t.letterRequests.villageId, villageId)))
    .limit(1);
  if (!row) throw new DomainError("Pengajuan tidak ditemukan", "REQUEST_NOT_FOUND", 404);
  return row;
}

const ALLOWED_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  PENDING_VERIFIKASI: ["DIVERIFIKASI", "BERKAS_TIDAK_LENGKAP", "DITOLAK"],
  BERKAS_TIDAK_LENGKAP: ["PENDING_VERIFIKASI", "DIVERIFIKASI", "DITOLAK"],
  DIVERIFIKASI: ["MENUNGGU_TTD_KADES", "SIAP_DIAMBIL", "BERKAS_TIDAK_LENGKAP", "DITOLAK"],
  MENUNGGU_TTD_KADES: ["DITANDATANGANI", "DIVERIFIKASI", "DITOLAK"],
  DITANDATANGANI: ["SIAP_DIAMBIL", "SELESAI"],
  SIAP_DIAMBIL: ["SELESAI"],
  SELESAI: [],
  DITOLAK: ["PENDING_VERIFIKASI"],
};

export function canTransition(from: RequestStatus, to: RequestStatus) {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}


function approvalTarget(from: RequestStatus, requiresSignature: boolean): RequestStatus {
  if (from === "DIVERIFIKASI") return requiresSignature ? "MENUNGGU_TTD_KADES" : "SIAP_DIAMBIL";
  return "DIVERIFIKASI";
}

export async function verifyLetterRequest(input: {
  villageId: string;
  requestId: string;
  staffId: string;
  payload: VerifyRequestInput;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const request = await loadRequest(tx, input.villageId, input.requestId);
    const currentStatus = request.status as RequestStatus;

    const [letterType] = await tx
      .select()
      .from(t.letterTypes)
      .where(eq(t.letterTypes.id, request.letterTypeId))
      .limit(1);

    // --- 1. Record the per-document verdicts ------------------------------
    if (input.payload.attachments?.length) {
      for (const verdict of input.payload.attachments) {
        const [updated] = await tx
          .update(t.letterAttachments)
          .set({
            status: verdict.status,
            defectNote: verdict.defectNote ?? null,
            verifiedByStaffId: staff.id,
          })
          .where(
            and(
              eq(t.letterAttachments.id, verdict.attachmentId),
              eq(t.letterAttachments.requestId, request.id),
            ),
          )
          .returning({ id: t.letterAttachments.id });
        if (!updated) {
          throw new DomainError(
            `Berkas ${verdict.attachmentId} bukan bagian dari pengajuan ini`,
            "ATTACHMENT_MISMATCH",
          );
        }
      }
    }

    const attachments = await tx
      .select()
      .from(t.letterAttachments)
      .where(eq(t.letterAttachments.requestId, request.id));

    const defective = attachments.filter((a) => a.status === "BURAM" || a.status === "TIDAK_ADA");

    // --- 2. Determine the next state --------------------------------------
    let nextStatus: RequestStatus;
    switch (input.payload.action) {
      case "setujui":
        if (defective.length > 0) {
          throw new DomainError(
            `${defective.length} berkas masih bermasalah. Perbaiki status berkas sebelum menyetujui.`,
            "ATTACHMENTS_DEFECTIVE",
            409,
          );
        }
        nextStatus = approvalTarget(currentStatus, letterType?.requiresKadesSignature !== false);
        break;
      case "minta_perbaikan":
        nextStatus = "BERKAS_TIDAK_LENGKAP";
        break;
      case "tolak":
        nextStatus = "DITOLAK";
        break;
    }

    if (!canTransition(currentStatus, nextStatus)) {
      throw new DomainError(
        `Status tidak dapat diubah dari "${REQUEST_STATUS[currentStatus]?.label ?? currentStatus}" ke "${REQUEST_STATUS[nextStatus]?.label ?? nextStatus}".`,
        "INVALID_TRANSITION",
        409,
      );
    }

    const now = new Date();
    const firstDefect = defective[0];
    const note = input.payload.note?.trim() || null;

    // --- 3. Update the request -------------------------------------------
    const [updatedRequest] = await tx
      .update(t.letterRequests)
      .set({
        status: nextStatus,
        assignedStaffId: staff.id,
        complianceNote:
          nextStatus === "BERKAS_TIDAK_LENGKAP"
            ? (firstDefect?.defectNote ?? note ?? "Berkas perlu diperbaiki")
            : null,
        rejectionReason: nextStatus === "DITOLAK" ? (note ?? "Tidak memenuhi persyaratan") : null,
        priority: input.payload.expedite ? "PRIORITAS" : request.priority,
        verifiedAt: now,
        updatedAt: now,
      })
      .where(eq(t.letterRequests.id, request.id))
      .returning();

    // --- 4. Open or close the signature ceremony --------------------------
    if (nextStatus === "MENUNGGU_TTD_KADES") {
      const [signer] = await tx
        .select()
        .from(t.staff)
        .where(and(eq(t.staff.villageId, input.villageId), eq(t.staff.canSign, true)))
        .limit(1);

      await tx.insert(t.signatureRequests).values({
        requestId: request.id,
        requestedByStaffId: staff.id,
        signerStaffId: signer?.id ?? null,
        status: "MENUNGGU",
        requestedAt: now,
        expiresAt: new Date(now.getTime() + 3 * 86_400_000),
        note: "Berkas diverifikasi lengkap dan siap ditandatangani.",
      });

      if (signer) {
        await tx.insert(t.notifications).values({
          villageId: input.villageId,
          recipientStaffId: signer.id,
          title: `${request.ticket} siap ditandatangani`,
          body: `${letterType?.name ?? "Surat"} untuk ${request.applicantName} menunggu tanda tangan elektronik.`,
          severity: "WARNING",
          href: `/antrean?request=${request.id}`,
          subjectType: "letter_request",
          subjectId: request.id,
          subjectRef: request.ticket,
          meta: { letterType: letterType?.code ?? null },
        });
      }
    }

    if (nextStatus === "BERKAS_TIDAK_LENGKAP" || nextStatus === "DITOLAK") {
      await tx
        .update(t.signatureRequests)
        .set({ status: "DIBATALKAN" })
        .where(
          and(
            eq(t.signatureRequests.requestId, request.id),
            eq(t.signatureRequests.status, "MENUNGGU"),
          ),
        );
    }

    // --- 5. Audit ---------------------------------------------------------
    const summary =
      nextStatus === "MENUNGGU_TTD_KADES"
        ? `Berkas ${request.ticket} (${letterType?.code}) diverifikasi lengkap dan diteruskan ke agenda tanda tangan Kepala Desa.`
        : nextStatus === "DIVERIFIKASI"
          ? `Berkas ${request.ticket} (${letterType?.code}) dinyatakan lengkap oleh ${staff.jobTitle}.`
          : nextStatus === "SIAP_DIAMBIL"
            ? `${request.ticket} selesai diproses dan siap diambil pemohon.`
            : nextStatus === "BERKAS_TIDAK_LENGKAP"
              ? `${request.ticket} dikembalikan untuk perbaikan — ${firstDefect?.defectNote ?? note ?? "berkas belum memenuhi syarat"}.`
              : `${request.ticket} ditolak. Alasan: ${note ?? "tidak memenuhi persyaratan"}.`;

    await writeAudit(tx, input.villageId, {
      kind: nextStatus === "DITOLAK" ? "PENOLAKAN" : nextStatus === "BERKAS_TIDAK_LENGKAP" ? "PENOLAKAN" : "VERIFIKASI_BERKAS",
      summary,
      subjectType: "letter_request",
      subjectId: request.id,
      subjectRef: request.ticket,
      actor: {
        id: staff.id,
        name: staff.fullName,
        initials: staff.initials,
        role: staff.jobTitle,
      },
      meta: {
        from: currentStatus,
        to: nextStatus,
        letterType: letterType?.code,
        documents: `${request.documentsUploaded}/${request.documentsRequired}`,
        defective: defective.length,
      },
    });

    return {
      request: updatedRequest,
      previousStatus: currentStatus,
      defectiveCount: defective.length,
      letterTypeName: letterType?.name ?? "",
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Electronic signature                                                        */
/* -------------------------------------------------------------------------- */

export async function signLetterRequest(input: {
  villageId: string;
  requestId: string;
  staffId: string;
  passphrase: string;
  certificateSerial?: string;
}) {
  const db = await getDb();

  const staff = await loadStaff(db, input.staffId);
  if (!staff.canSign) {
    throw new DomainError(
      "Hanya Kepala Desa yang berwenang menandatangani surat.",
      "NOT_AUTHORISED_SIGNER",
      403,
    );
  }

  if (staff.signLockedUntil && staff.signLockedUntil.getTime() > Date.now()) {
    throw new DomainError(
      `Sertifikat tanda tangan terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam ${lockoutMinutesLeft(staff.signLockedUntil)} menit.`,
      "SIGN_LOCKED",
      429,
    );
  }
  if (!staff.signaturePassphraseHash) {
    throw new DomainError(
      "Sertifikat tanda tangan elektronik Anda belum diaktivasi. Aktivasikan melalui menu \"Profil & Hak Akses\".",
      "SIGNATURE_NOT_ACTIVATED",
      409,
    );
  }
  if (!verifyPassword(input.passphrase, staff.signaturePassphraseHash)) {
    const state = await registerFailedSignAttempt(db, staff);
    await appendAudit(input.villageId, {
      kind: "KEAMANAN_AKUN",
      summary: state.locked
        ? `Sertifikat tanda tangan ${staff.fullName} terkunci setelah ${state.attempts} percobaan frasa sandi gagal.`
        : `Percobaan frasa sandi tanda tangan gagal untuk ${staff.fullName} (${state.attempts}/${MAX_SIGN_ATTEMPTS}).`,
      subjectType: "staff",
      subjectId: staff.id,
      actor: {
        id: staff.id,
        name: staff.fullName,
        initials: staff.initials,
        role: staff.jobTitle,
      },
      // Attempts and outcome only — never the passphrase that was tried.
      meta: { attempts: state.attempts, locked: state.locked },
    });
    if (state.locked) {
      throw new DomainError(
        "Frasa sandi tidak sesuai dan sertifikat kini terkunci sementara. Hubungi administrator desa bila ini keliruan.",
        "SIGN_LOCKED",
        429,
      );
    }
    throw new DomainError(
      "Frasa sandi sertifikat tidak sesuai. Periksa kembali frasa sandi BSrE Anda.",
      "INVALID_PASSPHRASE",
      401,
    );
  }
  await resetSignAttempts(db, staff.id);

  return db.transaction(async (tx) => {
    const request = await loadRequest(tx, input.villageId, input.requestId);
    if (request.status !== "MENUNGGU_TTD_KADES") {
      throw new DomainError(
        `Surat berstatus "${REQUEST_STATUS[request.status as RequestStatus]?.label}" tidak menunggu tanda tangan.`,
        "INVALID_TRANSITION",
        409,
      );
    }

    const [letterType] = await tx
      .select()
      .from(t.letterTypes)
      .where(eq(t.letterTypes.id, request.letterTypeId))
      .limit(1);

    const now = new Date();
    // A production integration receives the serial from the BSrE signing API;
    // here it is minted locally so every signature is traceable in the archive.
    const serial = input.certificateSerial?.trim() || `BSrE-${generateVerificationCode()}`;

    await tx
      .update(t.signatureRequests)
      .set({ status: "DITANDATANGANI", signedAt: now, certificateSerial: serial })
      .where(
        and(eq(t.signatureRequests.requestId, request.id), eq(t.signatureRequests.status, "MENUNGGU")),
      );

    const [updatedRequest] = await tx
      .update(t.letterRequests)
      .set({ status: "DITANDATANGANI", signedAt: now, updatedAt: now })
      .where(eq(t.letterRequests.id, request.id))
      .returning();

    await writeAudit(tx, input.villageId, {
      kind: "TANDA_TANGAN",
      summary: `${letterType?.name ?? "Surat"} ${request.ticket} ditandatangani digital oleh ${staff.fullName} (${serial}).`,
      subjectType: "letter_request",
      subjectId: request.id,
      subjectRef: request.ticket,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      // Never the passphrase itself, not even a failed attempt's guess.
      meta: { certificateSerial: serial, qr: request.verificationCode },
    });

    return { request: updatedRequest, certificateSerial: serial };
  });
}

export async function activateSignaturePassphrase(input: {
  villageId: string;
  staffId: string;
  currentPassphrase?: string;
  newPassphrase: string;
}) {
  const db = await getDb();
  const staff = await loadStaff(db, input.staffId);
  if (!staff.canSign) {
    throw new DomainError(
      "Hanya pejabat penanda tangan yang dapat mengaktivasi sertifikat tanda tangan.",
      "NOT_AUTHORISED_SIGNER",
      403,
    );
  }

  const rotating = Boolean(staff.signaturePassphraseHash);
  if (rotating) {
    if (staff.signLockedUntil && staff.signLockedUntil.getTime() > Date.now()) {
      throw new DomainError(
        `Aktivasi sertifikat terkunci sementara. Coba lagi dalam ${lockoutMinutesLeft(staff.signLockedUntil)} menit.`,
        "SIGN_LOCKED",
        429,
      );
    }
    if (!input.currentPassphrase || !verifyPassword(input.currentPassphrase, staff.signaturePassphraseHash)) {
      const state = await registerFailedSignAttempt(db, staff);
      await appendAudit(input.villageId, {
        kind: "KEAMANAN_AKUN",
        summary: `Percobaan penggantian frasa sandi tanda tangan gagal untuk ${staff.fullName} (${state.attempts}/${MAX_SIGN_ATTEMPTS}).`,
        subjectType: "staff",
        subjectId: staff.id,
        actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
        meta: { scope: "activation", attempts: state.attempts, locked: state.locked },
      });
      throw new DomainError(
        "Frasa sandi saat ini tidak sesuai.",
        "INVALID_PASSPHRASE",
        401,
      );
    }
  }

  await db
    .update(t.staff)
    .set({
      signaturePassphraseHash: hashPassword(input.newPassphrase),
      signAttempts: 0,
      signLockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(t.staff.id, staff.id));

  await appendAudit(input.villageId, {
    kind: "AKTIVASI_TTD",
    summary: rotating
      ? `${staff.fullName} mengganti frasa sandi sertifikat tanda tangan elektroniknya.`
      : `${staff.fullName} mengaktivasi sertifikat tanda tangan elektroniknya.`,
    subjectType: "staff",
    subjectId: staff.id,
    actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
    meta: { rotated: rotating },
  });

  return { activated: true as const, rotated: rotating as boolean };
}

export async function recordPrintRun(input: {
  villageId: string;
  requestId: string;
  staffId: string;
  mode: "draft" | "final";
  copies: number;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const request = await loadRequest(tx, input.villageId, input.requestId);

    const [letterType] = await tx
      .select()
      .from(t.letterTypes)
      .where(eq(t.letterTypes.id, request.letterTypeId))
      .limit(1);

    const now = new Date();
    const status = request.status as RequestStatus;

    let nextStatus: RequestStatus = status;
    let completedAt = request.completedAt;

    if (input.mode === "final") {
      if (status === "DITANDATANGANI" || status === "DIVERIFIKASI") {
        nextStatus = "SIAP_DIAMBIL";
      } else if (status === "SIAP_DIAMBIL") {
        nextStatus = "SELESAI";
        completedAt = now;
      }
    }

    if (nextStatus !== status) {
      await tx
        .update(t.letterRequests)
        .set({ status: nextStatus, completedAt, updatedAt: now })
        .where(eq(t.letterRequests.id, request.id));
    }

    await writeAudit(tx, input.villageId, {
      kind: "CETAK_SURAT",
      summary:
        input.mode === "draft"
          ? `Draf ${request.ticket} (${letterType?.code}) dicetak sebanyak ${input.copies} lembar untuk peninjauan.`
          : `${request.ticket} (${letterType?.code}) dicetak final dengan QR verifikasi ${request.verificationCode} dan siap diserahkan.`,
      subjectType: "letter_request",
      subjectId: request.id,
      subjectRef: request.ticket,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: {
        mode: input.mode,
        copies: input.copies,
        qr: request.verificationCode,
        status: nextStatus,
      },
    });

    return { status: nextStatus, verificationCode: request.verificationCode };
  });
}

/** Confirms hand-over and closes the request. */
export async function markRequestCollected(input: {
  villageId: string;
  requestId: string;
  staffId: string;
  collectedBy: string;
  note?: string;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const request = await loadRequest(tx, input.villageId, input.requestId);

    if (request.status !== "SIAP_DIAMBIL" && request.status !== "DITANDATANGANI") {
      throw new DomainError(
        "Surat belum siap diserahkan kepada pemohon.",
        "NOT_READY_FOR_COLLECTION",
        409,
      );
    }

    const now = new Date();
    await tx
      .update(t.letterRequests)
      .set({ status: "SELESAI", completedAt: now, updatedAt: now })
      .where(eq(t.letterRequests.id, request.id));

    await writeAudit(tx, input.villageId, {
      kind: "CETAK_SURAT",
      summary: `${request.ticket} diserahkan kepada ${input.collectedBy} dan dinyatakan selesai.`,
      subjectType: "letter_request",
      subjectId: request.id,
      subjectRef: request.ticket,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: { collectedBy: input.collectedBy, note: input.note ?? null },
    });

    return { completedAt: now };
  });
}

export async function recordResidentDownload(input: {
  villageId: string;
  requestId: string;
  ticket: string;
  verificationCode: string;
  residentId: string;
  residentName: string;
}) {
  const initials = input.residentName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

  await appendAudit(input.villageId, {
    kind: "CETAK_SURAT",
    summary: `Salinan final ${input.ticket} diunduh oleh pemohon ${input.residentName} melalui portal warga.`,
    subjectType: "letter_request",
    subjectId: input.requestId,
    subjectRef: input.ticket,
    actor: {
      id: null,
      name: input.residentName,
      initials: initials || "W",
      role: "Warga (Portal)",
    },
    meta: { channel: "PORTAL_WARGA", qr: input.verificationCode },
  });
}

/* -------------------------------------------------------------------------- */
/* Online letter submissions (portal warga → antrean loket)                     */
/* -------------------------------------------------------------------------- */

/** An upload the route has already persisted; only the server knows the key. */
type StoredLetterAttachment = LetterAttachmentManifest & { storageKey: string };

export async function createLetterRequest(input: {
  villageId: string;
  residentId: string;
  draft: LetterRequestDraft & { attachments: StoredLetterAttachment[] };
  requestId?: string;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const resident = await loadResident(tx, input.villageId, input.residentId);
    if (resident.status !== "AKTIF") {
      throw new DomainError(
        "Akun penduduk tidak berstatus aktif. Hubungi kantor desa untuk pemutakhiran data.",
        "RESIDENT_INACTIVE",
        409,
      );
    }

    const [letterType] = await tx
      .select()
      .from(t.letterTypes)
      .where(
        and(
          eq(t.letterTypes.id, input.draft.letterTypeId),
          eq(t.letterTypes.villageId, input.villageId),
          eq(t.letterTypes.active, true),
        ),
      )
      .limit(1);
    if (!letterType) {
      throw new DomainError(
        "Jenis surat tidak tersedia atau sudah tidak dilayani.",
        "LETTER_TYPE_NOT_FOUND",
        404,
      );
    }

    const requirements = await tx
      .select()
      .from(t.letterRequirements)
      .where(eq(t.letterRequirements.letterTypeId, letterType.id))
      .orderBy(t.letterRequirements.sortOrder);

    const allowed = new Map(requirements.map((req) => [req.docKey, req]));

    // Reject unknown document keys and duplicated uploads for the same key.
    const seen = new Set<string>();
    for (const file of input.draft.attachments) {
      if (!allowed.has(file.docKey)) {
        throw new DomainError(
          `Berkas "${file.docKey}" bukan persyaratan untuk ${letterType.name}.`,
          "UNKNOWN_ATTACHMENT",
          422,
        );
      }
      if (seen.has(file.docKey)) {
        throw new DomainError(
          `Berkas ${allowed.get(file.docKey)?.label ?? file.docKey} diunggah lebih dari satu kali.`,
          "DUPLICATE_ATTACHMENT",
          422,
        );
      }
      seen.add(file.docKey);
    }

    const missing = requirements.filter(
      (req) => req.mandatory && !seen.has(req.docKey),
    );
    if (missing.length) {
      throw new DomainError(
        `Berkas wajib belum diunggah: ${missing.map((req) => req.label).join(", ")}.`,
        "ATTACHMENTS_REQUIRED",
        422,
      );
    }

    const neighborhood = await loadNeighborhood(
      tx,
      input.villageId,
      resident.neighborhoodId,
    );

    const ticket = await nextTicket(tx, "letter_requests", "SRT");
    const submittedAt = new Date();
    const [request] = await tx
      .insert(t.letterRequests)
      .values({
        ...(input.requestId ? { id: input.requestId } : {}),
        ticket,
        villageId: input.villageId,
        letterTypeId: letterType.id,
        applicantResidentId: resident.id,
        applicantName: resident.fullName,
        applicantNik: resident.nik,
        applicantPhone: resident.phone,
        familyId: resident.familyId,
        neighborhoodId: neighborhood.id,
        address: resident.address,
        purpose: input.draft.purpose,
        payload: input.draft.payload,
        status: "PENDING_VERIFIKASI",
        priority: "NORMAL",
        channel: input.draft.channel,
        documentsUploaded: input.draft.attachments.length,
        documentsRequired: requirements.length,
        submittedAt,
        dueAt: new Date(submittedAt.getTime() + letterType.slaDays * 86_400_000),
        verificationCode: generateVerificationCode(),
        agendaNumber: await nextAgendaNumber(tx),
      })
      .returning();

    for (const file of input.draft.attachments) {
      await tx.insert(t.letterAttachments).values({
        requestId: request.id,
        docKey: file.docKey,
        label: allowed.get(file.docKey)?.label ?? file.docKey,
        fileName: file.fileName,
        storageKey: file.storageKey,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        uploadedAt: submittedAt,
      });
    }

    await writeAudit(tx, input.villageId, {
      kind: "PENGAJUAN_BARU",
      summary: `${resident.fullName} mengajukan ${letterType.name} melalui portal warga dengan nomor ${ticket}.`,
      subjectType: "letter_request",
      subjectId: request.id,
      subjectRef: ticket,
      actor: {
        id: null,
        name: resident.fullName,
        initials: initialsOf(resident.fullName) || "W",
        role: "Warga (Portal)",
      },
      meta: {
        channel: input.draft.channel,
        letterType: letterType.code,
        documents: `${input.draft.attachments.length}/${requirements.length}`,
        slaDays: letterType.slaDays,
      },
    });

    await notifyOfficers(tx, input.villageId, {
      title: `${ticket} menunggu verifikasi`,
      body: `${letterType.name} diajukan ${resident.fullName} (${neighborhood.hamletName} · RT ${neighborhood.rt}/RW ${neighborhood.rw}).`,
      severity: "INFO",
      href: `/antrean?request=${request.id}`,
      subjectType: "letter_request",
      subjectId: request.id,
      subjectRef: ticket,
      meta: { letterType: letterType.code },
    });

    return request;
  });
}

/* -------------------------------------------------------------------------- */
/* Announcements                                                               */
/* -------------------------------------------------------------------------- */

export async function publishAnnouncement(input: {
  villageId: string;
  staffId: string;
  draft: AnnouncementDraft;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const slugBase = slugifyAnnouncement(input.draft.title);

    // Slugs are unique per village; suffix on collision rather than failing.
    const existing = await tx
      .select({ slug: t.announcements.slug })
      .from(t.announcements)
      .where(and(eq(t.announcements.villageId, input.villageId), sql`${t.announcements.slug} like ${`${slugBase}%`}`));

    const taken = new Set(existing.map((row) => row.slug));
    let slug = slugBase;
    let suffix = 2;
    while (taken.has(slug)) {
      slug = `${slugBase}-${suffix++}`;
    }

    const now = new Date();
    const publishAt =
      input.draft.status === "TERBIT"
        ? (input.draft.publishAt ?? now)
        : input.draft.publishAt ?? null;

    const [row] = await tx
      .insert(t.announcements)
      .values({
        villageId: input.villageId,
        title: input.draft.title,
        slug,
        excerpt: input.draft.body.slice(0, 300),
        body: input.draft.body,
        channel: input.draft.channel,
        status: input.draft.status,
        priority: input.draft.priority,
        pinned: input.draft.pinned,
        audience: input.draft.audience,
        authorStaffId: staff.id,
        publishAt,
        expiresAt: input.draft.expiresAt ?? null,
      })
      .returning();

    await writeAudit(tx, input.villageId, {
      kind: "PENGUMUMAN",
      summary:
        input.draft.status === "TERBIT"
          ? `Pengumuman "${input.draft.title}" diterbitkan ke ${input.draft.channel === "WEBSITE_DESA" ? "website desa" : input.draft.channel === "PAPAN_INFORMASI" ? "papan informasi" : "grup WhatsApp warga"}.`
          : `Draf pengumuman "${input.draft.title}" disimpan.`,
      subjectType: "announcement",
      subjectId: row.id,
      subjectRef: null,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: {
        channel: input.draft.channel,
        status: input.draft.status,
        priority: input.draft.priority,
        pinned: input.draft.pinned,
      },
    });

    return row;
  });
}

function slugifyAnnouncement(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 180) || `pengumuman-${Date.now()}`
  );
}

async function loadAnnouncement(tx: DbOrTx, villageId: string, announcementId: string) {
  const [row] = await tx
    .select()
    .from(t.announcements)
    .where(
      and(
        eq(t.announcements.id, announcementId),
        eq(t.announcements.villageId, villageId),
      ),
    )
    .limit(1);
  if (!row) throw new DomainError("Pengumuman tidak ditemukan", "ANNOUNCEMENT_NOT_FOUND", 404);
  return row;
}

export async function updateAnnouncement(input: {
  villageId: string;
  staffId: string;
  announcementId: string;
  draft: AnnouncementUpdate;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const announcement = await loadAnnouncement(tx, input.villageId, input.announcementId);

    const patch: Partial<t.NewAnnouncement> = { updatedAt: new Date() };
    if (input.draft.title !== undefined) patch.title = input.draft.title;
    if (input.draft.body !== undefined) {
      patch.body = input.draft.body;
      patch.excerpt = input.draft.body.slice(0, 300);
    }
    if (input.draft.channel !== undefined) patch.channel = input.draft.channel;
    if (input.draft.priority !== undefined) patch.priority = input.draft.priority;
    if (input.draft.pinned !== undefined) patch.pinned = input.draft.pinned;
    if (input.draft.audience !== undefined) patch.audience = input.draft.audience;
    if (input.draft.publishAt !== undefined) patch.publishAt = input.draft.publishAt;
    if (input.draft.expiresAt !== undefined) patch.expiresAt = input.draft.expiresAt;

    if (input.draft.status !== undefined && input.draft.status !== announcement.status) {
      patch.status = input.draft.status;
      // Publishing stamps the release time when nobody scheduled one.
      if (input.draft.status === "TERBIT" && !announcement.publishAt && !input.draft.publishAt) {
        patch.publishAt = new Date();
      }
    }

    if (input.draft.title !== undefined && input.draft.title !== announcement.title) {
      const slugBase = slugifyAnnouncement(input.draft.title);
      const existing = await tx
        .select({ slug: t.announcements.slug })
        .from(t.announcements)
        .where(
          and(
            eq(t.announcements.villageId, input.villageId),
            sql`${t.announcements.slug} like ${`${slugBase}%`}`,
            sql`${t.announcements.id} <> ${announcement.id}`,
          ),
        );
      const taken = new Set(existing.map((row) => row.slug));
      let slug = slugBase;
      let suffix = 2;
      while (taken.has(slug)) {
        slug = `${slugBase}-${suffix++}`;
      }
      patch.slug = slug;
    }

    const changedKeys = Object.keys(patch).filter(
      (key) => key !== "updatedAt" && key !== "excerpt" && key !== "slug",
    );
    if (!changedKeys.length) {
      throw new DomainError("Tidak ada data yang diubah", "VALIDATION_ERROR", 422);
    }

    const [updated] = await tx
      .update(t.announcements)
      .set(patch)
      .where(eq(t.announcements.id, announcement.id))
      .returning();
    if (!updated) throw new DomainError("Pengumuman tidak ditemukan", "ANNOUNCEMENT_NOT_FOUND", 404);

    const statusLabel = ANNOUNCEMENT_STATUS[updated.status]?.label ?? updated.status;

    await writeAudit(tx, input.villageId, {
      kind: "PENGUMUMAN",
      summary: `Pengumuman "${updated.title}" diperbarui (status: ${statusLabel}).`,
      subjectType: "announcement",
      subjectId: updated.id,
      subjectRef: null,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: {
        changedFields: changedKeys,
        status: updated.status,
        channel: updated.channel,
        editedBy: staff.id,
      },
    });

    return updated;
  });
}

export async function deleteAnnouncement(input: {
  villageId: string;
  staffId: string;
  announcementId: string;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const announcement = await loadAnnouncement(tx, input.villageId, input.announcementId);

    await tx.delete(t.announcements).where(eq(t.announcements.id, announcement.id));

    await writeAudit(tx, input.villageId, {
      kind: "PENGHAPUSAN_DATA",
      summary: `Pengumuman "${announcement.title}" dihapus oleh ${staff.jobTitle}.`,
      subjectType: "announcement",
      subjectId: announcement.id,
      subjectRef: null,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
    
      meta: {
        title: announcement.title,
        body: announcement.body,
        channel: announcement.channel,
        status: announcement.status,
        viewCount: announcement.viewCount,
      },
    });

    if (announcement.status === "TERBIT") {
      await notifyOfficers(tx, input.villageId, {
        title: "Pengumuman ditarik dari kanal publik",
        body: `Pengumuman "${announcement.title}" ditarik dari kanal publik oleh ${staff.fullName}.`,
        severity: "WARNING",
        href: "/pengumuman",
        subjectType: "announcement",
        subjectId: announcement.id,
        subjectRef: null,
      });
    }

    return {
      id: announcement.id,
      title: announcement.title,
      status: announcement.status,
      wasPublished: announcement.status === "TERBIT",
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

export async function markNotificationsRead(villageId: string, staffId: string, ids?: string[]) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const visible = await tx
      .select({ id: t.notifications.id })
      .from(t.notifications)
      .where(
        and(
          eq(t.notifications.villageId, villageId),
          sql`(${t.notifications.recipientStaffId} is null or ${t.notifications.recipientStaffId} = ${staffId})`,
          sql`not exists (
            select 1 from notification_reads nr
            where nr.notification_id = ${t.notifications.id} and nr.staff_id = ${staffId}
          )`,
          sql`${t.notifications.readAt} is null`,
          ids?.length ? inArray(t.notifications.id, ids) : sql`true`,
        ),
      );

    const targets = visible.map((row) => row.id);
    if (!targets.length) return { updated: 0 };

    const inserted = await tx
      .insert(t.notificationReads)
      .values(
        targets.map((notificationId) => ({
          villageId,
          notificationId,
          staffId,
          readAt: new Date(),
        })),
      )
      .onConflictDoNothing({
        target: [t.notificationReads.notificationId, t.notificationReads.staffId],
      })
      .returning({ id: t.notificationReads.id });

    return { updated: inserted.length };
  });
}

/** Marks one notification read for the current officer only. */
export async function markNotificationRead(villageId: string, staffId: string, notificationId: string) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const [notification] = await tx
      .select({ id: t.notifications.id })
      .from(t.notifications)
      .where(
        and(
          eq(t.notifications.id, notificationId),
          eq(t.notifications.villageId, villageId),
          sql`(${t.notifications.recipientStaffId} is null or ${t.notifications.recipientStaffId} = ${staffId})`,
        ),
      )
      .limit(1);
    if (!notification) {
      throw new DomainError("Notifikasi tidak ditemukan", "NOTIFICATION_NOT_FOUND", 404);
    }

    const inserted = await tx
      .insert(t.notificationReads)
      .values({
        villageId,
        notificationId: notification.id,
        staffId,
        readAt: new Date(),
      })
      .onConflictDoNothing({
        target: [t.notificationReads.notificationId, t.notificationReads.staffId],
      })
      .returning({ id: t.notificationReads.id });

    return { updated: inserted.length };
  });
}

export async function markResidentAnnouncementsRead(input: {
  villageId: string;
  residentId: string;
  announcementIds?: string[];
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const resident = await loadResident(tx, input.villageId, input.residentId);

    const rows = input.announcementIds?.length
      ? await tx
          .select({ id: t.announcements.id })
          .from(t.announcements)
          .where(
            and(
              eq(t.announcements.villageId, input.villageId),
              inArray(t.announcements.id, input.announcementIds),
            ),
          )
      : await tx
          .select({ id: t.announcements.id })
          .from(t.announcements)
          .where(eq(t.announcements.villageId, input.villageId));

    const ids = rows.map((row) => row.id);
    if (!ids.length) return { updated: 0 };

    const inserted = await tx
      .insert(t.residentAnnouncementReads)
      .values(
        ids.map((announcementId) => ({
          villageId: input.villageId,
          residentId: resident.id,
          announcementId,
          readAt: new Date(),
        })),
      )
      .onConflictDoNothing({
        target: [
          t.residentAnnouncementReads.residentId,
          t.residentAnnouncementReads.announcementId,
        ],
      })
      .returning({ id: t.residentAnnouncementReads.id });

    return { updated: inserted.length };
  });
}

/* -------------------------------------------------------------------------- */
/* Citizen reports                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Files a laporan/aspirasi from the resident portal (or from the loket counter
 * on somebody's behalf) and pings every officer with a broadcast notification.
 */

/** Photos the route has already persisted; only the server knows the key. */
type StoredReportAttachment = ReportAttachmentManifest & { storageKey: string };

export async function createCitizenReport(input: {
  villageId: string;
  residentId: string | null;
  staffId?: string | null;
  draft: ReportDraft & { attachments: StoredReportAttachment[] };
  reportId?: string;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = input.staffId ? await loadStaff(tx, input.staffId) : null;
    const resident = input.residentId
      ? await loadResident(tx, input.villageId, input.residentId)
      : null;

    // Identity always comes from the registry, never from the submitted form.
    const reporter = resident
      ? {
          name: resident.fullName,
          nik: resident.nik,
          phone: resident.phone,
          neighborhoodId: resident.neighborhoodId,
        }
      : input.draft.reporter
        ? {
            name: input.draft.reporter.name,
            nik: input.draft.reporter.nik ?? null,
            phone: input.draft.reporter.phone ?? null,
            neighborhoodId: input.draft.neighborhoodId ?? null,
          }
        : null;

    if (!reporter) {
      throw new DomainError(
        "Nama pelapor wajib diisi untuk laporan yang dicatat di loket.",
        "REPORTER_REQUIRED",
        422,
      );
    }

    const neighborhoodId = input.draft.neighborhoodId ?? reporter.neighborhoodId;
    const neighborhood = neighborhoodId
      ? await loadNeighborhood(tx, input.villageId, neighborhoodId)
      : null;

    const ticket = await nextTicket(tx, "citizen_reports", "LPR");
    const submittedAt = new Date();

    const [report] = await tx
      .insert(t.citizenReports)
      .values({
        ...(input.reportId ? { id: input.reportId } : {}),
        ticket,
        villageId: input.villageId,
        reporterResidentId: resident?.id ?? null,
        reporterName: reporter.name,
        reporterNik: reporter.nik,
        reporterPhone: reporter.phone,
        neighborhoodId: neighborhood?.id ?? null,
        category: input.draft.category,
        subject: input.draft.subject,
        body: input.draft.body,
        status: "NEW",
        priority: input.draft.priority,
        handledByStaffId: null,
        responseCount: 0,
        attachmentCount: input.draft.attachments.length,
        submittedAt,
      })
      .returning();

    for (const file of input.draft.attachments) {
      await tx.insert(t.reportAttachments).values({
        reportId: report.id,
        fileName: file.fileName,
        storageKey: file.storageKey,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        width: file.width ?? null,
        height: file.height ?? null,
        caption: file.caption ?? null,
        uploadedByResidentId: resident?.id ?? null,
        uploadedAt: submittedAt,
      });
    }

    const categoryLabel =
      REPORT_CATEGORY[input.draft.category] ?? input.draft.category;
    const location = neighborhood
      ? `${neighborhood.hamletName} RT ${neighborhood.rt}/RW ${neighborhood.rw}`
      : "lokasi tidak disebutkan";

    await writeAudit(tx, input.villageId, {
      kind: "LAPORAN_BARU",
      summary: `${reporter.name} menyampaikan laporan ${categoryLabel.toLowerCase()} "${input.draft.subject}" (${location}) melalui ${staff ? "loket pelayanan" : "portal warga"}.`,
      subjectType: "citizen_report",
      subjectId: report.id,
      subjectRef: ticket,
      actor: staff
        ? {
            id: staff.id,
            name: staff.fullName,
            initials: staff.initials,
            role: staff.jobTitle,
          }
        : {
            id: null,
            name: reporter.name,
            initials: initialsOf(reporter.name) || "W",
            role: "Warga (Portal)",
          },
      meta: {
        category: input.draft.category,
        priority: input.draft.priority,
        channel: staff ? "LOKET" : "PORTAL_WARGA",
        attachments: input.draft.attachments.length,
      },
    });

    await notifyOfficers(tx, input.villageId, {
      title: `Laporan baru ${ticket} — ${categoryLabel}`,
      body: `${input.draft.subject} dilaporkan oleh ${reporter.name} (${location}).`,
      severity: notificationSeverity(input.draft.priority),
      href: `/laporan?report=${report.id}`,
      subjectType: "citizen_report",
      subjectId: report.id,
      subjectRef: ticket,
      meta: { category: input.draft.category, attachments: input.draft.attachments.length },
    });

    return report;
  });
}

export async function advanceReport(input: {
  villageId: string;
  reportId: string;
  staffId: string;
  status: "IN_PROGRESS" | "RESOLVED" | "REJECTED";
  note?: string;
  reason?: string;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);

    const [current] = await tx
      .select({
        id: t.citizenReports.id,
        ticket: t.citizenReports.ticket,
        status: t.citizenReports.status,
      })
      .from(t.citizenReports)
      .where(
        and(
          eq(t.citizenReports.id, input.reportId),
          eq(t.citizenReports.villageId, input.villageId),
        ),
      )
      .limit(1);

    if (!current) throw new DomainError("Laporan tidak ditemukan", "REPORT_NOT_FOUND", 404);

    if (current.status === "RESOLVED" || current.status === "REJECTED") {
      throw new DomainError(
        `Laporan ${current.ticket} sudah ditutup (${REPORT_STATUS[current.status]?.label ?? current.status}).`,
        "INVALID_TRANSITION",
        409,
      );
    }

    const reason = input.reason?.trim() || null;
    if (input.status === "REJECTED" && !reason) {
      throw new DomainError(
        "Alasan penolakan wajib diisi.",
        "REJECTION_REASON_REQUIRED",
        422,
      );
    }

    const now = new Date();
    const [report] = await tx
      .update(t.citizenReports)
      .set({
        status: input.status,
        handledByStaffId: staff.id,
        resolvedAt: input.status === "RESOLVED" ? now : null,
        ...(input.status === "REJECTED"
          ? { rejectionReason: reason, rejectedAt: now, rejectedByStaffId: staff.id }
          : {}),
        responseCount: sql`${t.citizenReports.responseCount} + 1`,
        updatedAt: now,
      })
      .where(eq(t.citizenReports.id, input.reportId))
      .returning();

    if (!report) throw new DomainError("Laporan tidak ditemukan", "REPORT_NOT_FOUND", 404);

    await writeAudit(tx, input.villageId, {
      kind: input.status === "REJECTED" ? "PENOLAKAN" : "PERSETUJUAN",
      summary:
        input.status === "REJECTED"
          ? `Laporan ${report.ticket} — "${report.subject}" ditolak. Alasan: ${reason}.`
          : `Laporan ${report.ticket} — "${report.subject}" ditandai ${input.status === "RESOLVED" ? "selesai" : "sedang dikerjakan"}.`,
      subjectType: "citizen_report",
      subjectId: report.id,
      subjectRef: report.ticket,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: {
        status: input.status,
        note: input.note ?? null,
        reason: input.status === "REJECTED" ? reason : null,
      },
    });

    if (input.status === "REJECTED") {
      // The desk must know a report was closed with a written reason.
      await notifyOfficers(tx, input.villageId, {
        title: `Laporan ${report.ticket} ditolak`,
        body: `"${report.subject}" ditutup oleh ${staff.fullName}. Alasan: ${reason}.`,
        severity: "WARNING",
        href: `/laporan?report=${report.id}`,
        subjectType: "citizen_report",
        subjectId: report.id,
        subjectRef: report.ticket,
        meta: { reason },
      });
    }

    return report;
  });
}
/* -------------------------------------------------------------------------- */
/* Citizen reports — reporter self-service (portal warga)                      */
/* -------------------------------------------------------------------------- */
async function loadEditableOwnReport(
  tx: DbOrTx,
  villageId: string,
  residentId: string,
  reportId: string,
) {
  const [report] = await tx
    .select()
    .from(t.citizenReports)
    .where(
      and(
        eq(t.citizenReports.id, reportId),
        eq(t.citizenReports.villageId, villageId),
      ),
    )
    .limit(1);
  if (!report) throw new DomainError("Laporan tidak ditemukan", "REPORT_NOT_FOUND", 404);
  if (report.reporterResidentId !== residentId) {
    throw new DomainError(
      "Laporan ini bukan milik Anda. Hanya pelapor yang dapat mengubah laporannya.",
      "REPORT_NOT_OWNED",
      403,
    );
  }
  if (!isReportEditable(report)) {
    throw new DomainError(
      `Laporan ${report.ticket} sudah ditindaklanjuti petugas dan tidak dapat diubah. Sampaikan informasi tambahan melalui kantor desa.`,
      "REPORT_ALREADY_HANDLED",
      409,
    );
  }
  return report;
}

/** Reporter edits their own untouched report (category/subject/body/lokasi). */
export async function updateCitizenReport(input: {
  villageId: string;
  residentId: string;
  reportId: string;
  draft: ReportUpdate;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const resident = await loadResident(tx, input.villageId, input.residentId);
    const report = await loadEditableOwnReport(tx, input.villageId, resident.id, input.reportId);

    const neighborhood = input.draft.neighborhoodId
      ? await loadNeighborhood(tx, input.villageId, input.draft.neighborhoodId)
      : null;

    const patch: Partial<t.NewCitizenReport> = {};
    if (input.draft.category !== undefined) patch.category = input.draft.category;
    if (input.draft.subject !== undefined) patch.subject = input.draft.subject;
    if (input.draft.body !== undefined) patch.body = input.draft.body;
    if (neighborhood) patch.neighborhoodId = neighborhood.id;
    if (input.draft.priority !== undefined) patch.priority = input.draft.priority;
    if (!Object.keys(patch).length) {
      throw new DomainError("Tidak ada data yang diubah", "VALIDATION_ERROR", 422);
    }

    const [updated] = await tx
      .update(t.citizenReports)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(t.citizenReports.id, report.id))
      .returning();
    if (!updated) throw new DomainError("Laporan tidak ditemukan", "REPORT_NOT_FOUND", 404);

    await writeAudit(tx, input.villageId, {
      kind: "PERUBAHAN_DATA",
      summary: `Laporan ${updated.ticket} — "${updated.subject}" diperbarui oleh pelapor ${resident.fullName}.`,
      subjectType: "citizen_report",
      subjectId: updated.id,
      subjectRef: updated.ticket,
      actor: {
        id: null,
        name: resident.fullName,
        initials: initialsOf(resident.fullName) || "W",
        role: "Warga (Portal)",
      },
      meta: {
        changedFields: Object.keys(patch),
        category: updated.category,
        priority: updated.priority,
      },
    });

    await notifyOfficers(tx, input.villageId, {
      title: `Laporan ${updated.ticket} diperbarui pelapor`,
      body: `${resident.fullName} mengubah laporan "${updated.subject}" sebelum ditindaklanjuti.`,
      severity: notificationSeverity(updated.priority),
      href: `/laporan?report=${updated.id}`,
      subjectType: "citizen_report",
      subjectId: updated.id,
      subjectRef: updated.ticket,
      meta: { changedFields: Object.keys(patch) },
    });

    return updated;
  });
}

/**
 * Reporter withdraws their own untouched report. The stored photos are
 * returned as keys so the route deletes the bytes after the commit succeeds.
 */
export async function deleteCitizenReport(input: {
  villageId: string;
  residentId: string;
  reportId: string;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const resident = await loadResident(tx, input.villageId, input.residentId);
    const report = await loadEditableOwnReport(tx, input.villageId, resident.id, input.reportId);

    const attachments = await tx
      .select({ storageKey: t.reportAttachments.storageKey })
      .from(t.reportAttachments)
      .where(eq(t.reportAttachments.reportId, report.id));

    await tx.delete(t.citizenReports).where(eq(t.citizenReports.id, report.id));

    await writeAudit(tx, input.villageId, {
      kind: "PENGHAPUSAN_DATA",
      summary: `Laporan ${report.ticket} ditarik kembali oleh pelapor ${resident.fullName}.`,
      subjectType: "citizen_report",
      subjectId: report.id,
      subjectRef: report.ticket,
      actor: {
        id: null,
        name: resident.fullName,
        initials: initialsOf(resident.fullName) || "W",
        role: "Warga (Portal)",
      },
      // The village book keeps the full withdrawn content.
      meta: {
        ticket: report.ticket,
        category: report.category,
        subject: report.subject,
        body: report.body,
        reporterNik: report.reporterNik,
        attachments: attachments.length,
      },
    });

    await notifyOfficers(tx, input.villageId, {
      title: `Laporan ${report.ticket} ditarik pelapor`,
      body: `"${report.subject}" ditarik kembali oleh ${resident.fullName} sebelum ditindaklanjuti.`,
      severity: "INFO",
      href: "/laporan",
      subjectType: "citizen_report",
      subjectId: report.id,
      subjectRef: report.ticket,
    });

    return {
      id: report.id,
      ticket: report.ticket,
      subject: report.subject,
      storageKeys: attachments.map((row) => row.storageKey),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Citizen reports — photo attachments                                         */
/* -------------------------------------------------------------------------- */

export type ReportAttachmentActor =
  | { type: "STAFF"; staffId: string }
  | { type: "RESIDENT"; residentId: string };

/** Authorisation for attachment writes: staff always, reporter while untouched. */
async function assertReportAttachmentAccess(
  tx: DbOrTx,
  villageId: string,
  reportId: string,
  actor: ReportAttachmentActor,
) {
  const [report] = await tx
    .select()
    .from(t.citizenReports)
    .where(
      and(
        eq(t.citizenReports.id, reportId),
        eq(t.citizenReports.villageId, villageId),
      ),
    )
    .limit(1);
  if (!report) throw new DomainError("Laporan tidak ditemukan", "REPORT_NOT_FOUND", 404);

  if (actor.type === "STAFF") {
    await loadStaff(tx, actor.staffId);
    return report;
  }

  if (report.reporterResidentId !== actor.residentId) {
    throw new DomainError(
      "Laporan ini bukan milik Anda. Hanya pelapor yang dapat mengubah lampirannya.",
      "REPORT_NOT_OWNED",
      403,
    );
  }
  if (!isReportEditable(report)) {
    throw new DomainError(
      `Laporan ${report.ticket} sudah ditindaklanjuti petugas dan tidak dapat diubah. Sampaikan informasi tambahan melalui kantor desa.`,
      "REPORT_ALREADY_HANDLED",
      409,
    );
  }
  return report;
}

/** Adds already-persisted photos to a report and keeps `attachment_count` true. */
export async function addReportAttachments(input: {
  villageId: string;
  reportId: string;
  actor: ReportAttachmentActor;
  attachments: StoredReportAttachment[];
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const report = await assertReportAttachmentAccess(tx, input.villageId, input.reportId, input.actor);
    if (!input.attachments.length) {
      throw new DomainError("Tidak ada foto yang ditambahkan.", "VALIDATION_ERROR", 422);
    }
    if (report.attachmentCount + input.attachments.length > MAX_REPORT_IMAGES) {
      throw new DomainError(
        `Maksimal ${MAX_REPORT_IMAGES} foto per laporan. Hapus salah satu foto sebelum menambahkan yang baru.`,
        "TOO_MANY_ATTACHMENTS",
        422,
      );
    }

    const actorLabel =
      input.actor.type === "STAFF"
        ? await loadStaff(tx, input.actor.staffId).then(
            (staff) => ({
              id: staff.id as string | null,
              name: staff.fullName,
              initials: staff.initials,
              role: staff.jobTitle,
            }),
          )
        : await loadResident(tx, input.villageId, input.actor.residentId).then((resident) => ({
            id: null as string | null,
            name: resident.fullName,
            initials: initialsOf(resident.fullName) || "W",
            role: "Warga (Portal)",
          }));

    const now = new Date();
    const rows: t.ReportAttachment[] = [];
    for (const file of input.attachments) {
      const [row] = await tx
        .insert(t.reportAttachments)
        .values({
          reportId: report.id,
          fileName: file.fileName,
          storageKey: file.storageKey,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          width: file.width ?? null,
          height: file.height ?? null,
          caption: file.caption ?? null,
          uploadedByResidentId:
            input.actor.type === "RESIDENT" ? input.actor.residentId : null,
          uploadedAt: now,
        })
        .returning();
      rows.push(row);
    }

    const [updated] = await tx
      .update(t.citizenReports)
      .set({
        attachmentCount: report.attachmentCount + rows.length,
        updatedAt: now,
      })
      .where(eq(t.citizenReports.id, report.id))
      .returning();

    await writeAudit(tx, input.villageId, {
      kind: "PERUBAHAN_DATA",
      summary: `${rows.length} foto ditambahkan ke laporan ${report.ticket} oleh ${actorLabel.name}.`,
      subjectType: "citizen_report",
      subjectId: report.id,
      subjectRef: report.ticket,
      actor: actorLabel,
      meta: { attachments: updated.attachmentCount, added: rows.length },
    });

    return {
      reportId: report.id,
      ticket: report.ticket,
      attachmentCount: updated.attachmentCount,
      attachments: rows,
    };
  });
}

/** Removes one photo; the route deletes the bytes after the commit. */
export async function removeReportAttachment(input: {
  villageId: string;
  reportId: string;
  attachmentId: string;
  actor: ReportAttachmentActor;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const report = await assertReportAttachmentAccess(tx, input.villageId, input.reportId, input.actor);

    const [attachment] = await tx
      .select()
      .from(t.reportAttachments)
      .where(
        and(
          eq(t.reportAttachments.id, input.attachmentId),
          eq(t.reportAttachments.reportId, report.id),
        ),
      )
      .limit(1);
    if (!attachment) {
      throw new DomainError("Foto tidak ditemukan pada laporan ini.", "ATTACHMENT_NOT_FOUND", 404);
    }

    const actorLabel =
      input.actor.type === "STAFF"
        ? await loadStaff(tx, input.actor.staffId).then(
            (staff) => ({
              id: staff.id as string | null,
              name: staff.fullName,
              initials: staff.initials,
              role: staff.jobTitle,
            }),
          )
        : await loadResident(tx, input.villageId, input.actor.residentId).then((resident) => ({
            id: null as string | null,
            name: resident.fullName,
            initials: initialsOf(resident.fullName) || "W",
            role: "Warga (Portal)",
          }));

    await tx.delete(t.reportAttachments).where(eq(t.reportAttachments.id, attachment.id));

    const [updated] = await tx
      .update(t.citizenReports)
      .set({
        attachmentCount: sql`greatest(${t.citizenReports.attachmentCount} - 1, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(t.citizenReports.id, report.id))
      .returning();

    await writeAudit(tx, input.villageId, {
      kind: "PERUBAHAN_DATA",
      summary: `Foto "${attachment.fileName}" dihapus dari laporan ${report.ticket} oleh ${actorLabel.name}.`,
      subjectType: "citizen_report",
      subjectId: report.id,
      subjectRef: report.ticket,
      actor: actorLabel,
      meta: { attachments: updated.attachmentCount, removed: attachment.id },
    });

    return {
      id: attachment.id,
      reportId: report.id,
      storageKey: attachment.storageKey,
      attachmentCount: updated.attachmentCount,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Population registry (capability: manageRegistry)                             */
/* -------------------------------------------------------------------------- */

async function assertNikAvailable(tx: DbOrTx, nik: string) {
  const [existing] = await tx
    .select({ id: t.residents.id, fullName: t.residents.fullName })
    .from(t.residents)
    .where(eq(t.residents.nik, nik))
    .limit(1);
  if (existing) {
    throw new DomainError(
      `NIK ${nik} sudah terdaftar atas nama ${existing.fullName}.`,
      "NIK_DUPLICATE",
      409,
    );
  }
}

/** Registers a new penduduk with full demographic detail. */
export async function createResident(input: {
  villageId: string;
  staffId: string;
  draft: ResidentDraft;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    await assertNikAvailable(tx, input.draft.nik);
    const neighborhood = await loadNeighborhood(
      tx,
      input.villageId,
      input.draft.neighborhoodId,
    );
    const family = input.draft.familyId
      ? await loadFamily(tx, input.villageId, input.draft.familyId)
      : null;

    const [resident] = await tx
      .insert(t.residents)
      .values({
        villageId: input.villageId,
        familyId: family?.id ?? null,
        nik: input.draft.nik,
        fullName: input.draft.fullName,
        gender: input.draft.gender,
        birthPlace: input.draft.birthPlace,
        birthDate: input.draft.birthDate,
        religion: input.draft.religion,
        maritalStatus: input.draft.maritalStatus,
        education: input.draft.education ?? null,
        occupation: input.draft.occupation ?? null,
        nationality: input.draft.nationality,
        familyRelation: input.draft.familyRelation,
        neighborhoodId: neighborhood.id,
        address: input.draft.address,
        phone: input.draft.phone ?? null,
        status: input.draft.status,
        documentsVerified: input.draft.documentsVerified,
      })
      .returning();

    if (family) await syncFamilyMemberCount(tx, family.id);

    await writeAudit(tx, input.villageId, {
      kind: "PENDAFTARAN_PENDUDUK",
      summary: `${resident.fullName} (NIK ${resident.nik}) didaftarkan sebagai penduduk ${neighborhood.hamletName} RT ${neighborhood.rt}/RW ${neighborhood.rw}.`,
      subjectType: "resident",
      subjectId: resident.id,
      subjectRef: resident.nik,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: {
        nik: resident.nik,
        familyId: family?.id ?? null,
        kkNumber: family?.kkNumber ?? null,
        status: resident.status,
      },
    });

    return resident;
  });
}

/**
 * Edits demographic data and records status changes (pindah keluar, meninggal,
 * …) as append-only rows in `resident_mutations`.
 */
export async function updateResident(input: {
  villageId: string;
  staffId: string;
  residentId: string;
  draft: ResidentUpdate;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const resident = await loadResident(tx, input.villageId, input.residentId);

    const neighborhood = input.draft.neighborhoodId
      ? await loadNeighborhood(tx, input.villageId, input.draft.neighborhoodId)
      : null;

    const nextFamilyId =
      input.draft.familyId === undefined
        ? resident.familyId
        : input.draft.familyId;
    const nextFamily = nextFamilyId
      ? await loadFamily(tx, input.villageId, nextFamilyId)
      : null;

    const patch: Partial<t.NewResident> = {
      updatedAt: new Date(),
    };
    if (input.draft.fullName !== undefined) patch.fullName = input.draft.fullName;
    if (input.draft.birthPlace !== undefined) patch.birthPlace = input.draft.birthPlace;
    if (input.draft.birthDate !== undefined) patch.birthDate = input.draft.birthDate;
    if (input.draft.religion !== undefined) patch.religion = input.draft.religion;
    if (input.draft.maritalStatus !== undefined) patch.maritalStatus = input.draft.maritalStatus;
    if (input.draft.education !== undefined) patch.education = input.draft.education;
    if (input.draft.occupation !== undefined) patch.occupation = input.draft.occupation;
    if (input.draft.nationality !== undefined) patch.nationality = input.draft.nationality;
    if (input.draft.familyRelation !== undefined) patch.familyRelation = input.draft.familyRelation;
    if (neighborhood) patch.neighborhoodId = neighborhood.id;
    if (input.draft.familyId !== undefined) patch.familyId = nextFamily?.id ?? null;
    if (input.draft.address !== undefined) patch.address = input.draft.address;
    if (input.draft.phone !== undefined) patch.phone = input.draft.phone ?? null;
    if (input.draft.status !== undefined) patch.status = input.draft.status;
    if (input.draft.documentsVerified !== undefined) {
      patch.documentsVerified = input.draft.documentsVerified;
    }

    const [updated] = await tx
      .update(t.residents)
      .set(patch)
      .where(eq(t.residents.id, resident.id))
      .returning();
    if (!updated) throw new DomainError("Penduduk tidak ditemukan", "RESIDENT_NOT_FOUND", 404);

    const statusChanged = input.draft.status !== undefined && input.draft.status !== resident.status;

    // Status changes leave a permanent trace in the mutation ledger.
    if (statusChanged) {
      const kind =
        input.draft.mutationKind ??
        (input.draft.status === "MENINGGAL"
          ? "KEMATIAN"
          : input.draft.status === "PINDAH_KELUAR"
            ? "PINDAH_KELUAR"
            : "PINDAH_DATANG");

      await tx.insert(t.residentMutations).values({
        residentId: resident.id,
        kind,
        effectiveDate: new Date().toISOString().slice(0, 10),
        notes:
          input.draft.mutationNote ??
          `Status kependudukan diubah menjadi ${input.draft.status}.`,
        recordedByStaffId: staff.id,
      });
    }

    if (nextFamilyId && nextFamilyId !== resident.familyId) {
      await syncFamilyMemberCount(tx, nextFamilyId);
    }
    if (resident.familyId && resident.familyId !== nextFamilyId) {
      await syncFamilyMemberCount(tx, resident.familyId);
    }

    await writeAudit(tx, input.villageId, {
      kind: "MUTASI_PENDUDUK",
      summary: statusChanged
        ? `Status ${updated.fullName} (NIK ${updated.nik}) diubah menjadi ${updated.status}${input.draft.mutationKind ? ` — ${MUTATION_KIND[input.draft.mutationKind] ?? input.draft.mutationKind}` : ""}.`
        : `Data kependudukan ${updated.fullName} (NIK ${updated.nik}) diperbarui oleh ${staff.jobTitle}.`,
      subjectType: "resident",
      subjectId: updated.id,
      subjectRef: updated.nik,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: {
        nik: updated.nik,
        changedFields: Object.keys(patch).filter((key) => key !== "updatedAt"),
        fromStatus: resident.status,
        toStatus: updated.status,
        mutationKind: input.draft.mutationKind ?? null,
      },
    });

    return updated;
  });
}

export async function deleteResident(input: {
  villageId: string;
  staffId: string;
  residentId: string;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const resident = await loadResident(tx, input.villageId, input.residentId);

    const [letters] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(t.letterRequests)
      .where(eq(t.letterRequests.applicantResidentId, resident.id));
    const [reports] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(t.citizenReports)
      .where(eq(t.citizenReports.reporterResidentId, resident.id));
    const [mutations] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(t.residentMutations)
      .where(eq(t.residentMutations.residentId, resident.id));

    const letterCount = letters?.count ?? 0;
    const reportCount = reports?.count ?? 0;
    if (letterCount + reportCount > 0) {
      throw new DomainError(
        `Data ${resident.fullName} tidak dapat dihapus karena masih terhubung dengan ${letterCount + reportCount} pengajuan surat/laporan warga. Ubah statusnya menjadi Pindah Keluar atau Meninggal.`,
        "RESIDENT_HAS_RECORDS",
        409,
      );
    }

    const family = resident.familyId
      ? await tx
          .select({ kkNumber: t.families.kkNumber })
          .from(t.families)
          .where(eq(t.families.id, resident.familyId))
          .limit(1)
      : [];

    await tx.delete(t.residents).where(eq(t.residents.id, resident.id));
    if (resident.familyId) await syncFamilyMemberCount(tx, resident.familyId);

    await writeAudit(tx, input.villageId, {
      kind: "PENGHAPUSAN_DATA",
      summary: `Data penduduk ${resident.fullName} (NIK ${resident.nik}) dihapus dari register desa oleh ${staff.jobTitle}.`,
      subjectType: "resident",
      subjectId: resident.id,
      subjectRef: resident.nik,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: {
        nik: resident.nik,
        fullName: resident.fullName,
        kkNumber: family[0]?.kkNumber ?? null,
        mutations: mutations?.count ?? 0,
        deletedBy: staff.id,
      },
    });

    return { id: resident.id, nik: resident.nik, fullName: resident.fullName };
  });
}

/** Opens a Kartu Keluarga and moves the listed residents into it. */
export async function createFamily(input: {
  villageId: string;
  staffId: string;
  draft: FamilyDraft;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);

    const [existing] = await tx
      .select({ id: t.families.id, headName: t.families.headName })
      .from(t.families)
      .where(eq(t.families.kkNumber, input.draft.kkNumber))
      .limit(1);
    if (existing) {
      throw new DomainError(
        `Nomor KK ${input.draft.kkNumber} sudah terdaftar atas nama ${existing.headName}.`,
        "KK_DUPLICATE",
        409,
      );
    }

    const neighborhood = await loadNeighborhood(
      tx,
      input.villageId,
      input.draft.neighborhoodId,
    );

    // Members must all belong to this village; one bad id fails the whole write.
    const members: t.Resident[] = [];
    for (const memberId of input.draft.memberIds) {
      members.push(await loadResident(tx, input.villageId, memberId));
    }

    const [family] = await tx
      .insert(t.families)
      .values({
        villageId: input.villageId,
        kkNumber: input.draft.kkNumber,
        neighborhoodId: neighborhood.id,
        address: input.draft.address,
        headName: input.draft.headName,
        welfareClass: input.draft.welfareClass,
        memberCount: 0,
      })
      .returning();

    for (const member of members) {
      await tx
        .update(t.residents)
        .set({ familyId: family.id, updatedAt: new Date() })
        .where(eq(t.residents.id, member.id));
      if (member.familyId) await syncFamilyMemberCount(tx, member.familyId);
    }
    await syncFamilyMemberCount(tx, family.id);

    const [withCount] = await tx
      .select()
      .from(t.families)
      .where(eq(t.families.id, family.id))
      .limit(1);

    await writeAudit(tx, input.villageId, {
      kind: "PENDAFTARAN_PENDUDUK",
      summary: `Kartu Keluarga ${family.kkNumber} atas nama ${family.headName} diterbitkan di ${neighborhood.hamletName} RT ${neighborhood.rt}/RW ${neighborhood.rw} dengan ${withCount?.memberCount ?? 0} anggota.`,
      subjectType: "family",
      subjectId: family.id,
      subjectRef: family.kkNumber,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: {
        kkNumber: family.kkNumber,
        welfareClass: family.welfareClass,
        memberIds: members.map((member) => member.id),
      },
    });

    return withCount ?? family;
  });
}

/**
 * Edits a Kartu Keluarga. `memberIds` replaces the member set: residents added
 * move in (their previous family is re-counted), residents removed are
 * detached, and every touched family keeps a truthful `member_count`.
 */
export async function updateFamily(input: {
  villageId: string;
  staffId: string;
  familyId: string;
  draft: FamilyUpdate;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const family = await loadFamily(tx, input.villageId, input.familyId);

    if (input.draft.kkNumber && input.draft.kkNumber !== family.kkNumber) {
      const [existing] = await tx
        .select({ id: t.families.id, headName: t.families.headName })
        .from(t.families)
        .where(eq(t.families.kkNumber, input.draft.kkNumber))
        .limit(1);
      if (existing) {
        throw new DomainError(
          `Nomor KK ${input.draft.kkNumber} sudah terdaftar atas nama ${existing.headName}.`,
          "KK_DUPLICATE",
          409,
        );
      }
    }

    const neighborhood = input.draft.neighborhoodId
      ? await loadNeighborhood(tx, input.villageId, input.draft.neighborhoodId)
      : null;

    const patch: Partial<t.NewFamily> = {};
    if (input.draft.kkNumber !== undefined) patch.kkNumber = input.draft.kkNumber;
    if (input.draft.headName !== undefined) patch.headName = input.draft.headName;
    if (neighborhood) patch.neighborhoodId = neighborhood.id;
    if (input.draft.address !== undefined) patch.address = input.draft.address;
    if (input.draft.welfareClass !== undefined) patch.welfareClass = input.draft.welfareClass;

    const changedKeys = Object.keys(patch);
    const membersChanged = input.draft.memberIds !== undefined;
    if (!changedKeys.length && !membersChanged) {
      throw new DomainError("Tidak ada data yang diubah", "VALIDATION_ERROR", 422);
    }

    const touchedFamilyIds = new Set<string>();

    if (membersChanged) {
      const wanted = new Set(input.draft.memberIds ?? []);
      const current = await tx
        .select({ id: t.residents.id, familyId: t.residents.familyId })
        .from(t.residents)
        .where(eq(t.residents.familyId, family.id));

      // Members no longer listed are released from the card.
      for (const member of current) {
        if (!wanted.has(member.id)) {
          await tx
            .update(t.residents)
            .set({ familyId: null, updatedAt: new Date() })
            .where(eq(t.residents.id, member.id));
        }
      }

      // Newly listed residents move in; their previous family is re-counted.
      for (const memberId of wanted) {
        const resident = await loadResident(tx, input.villageId, memberId);
        if (resident.familyId === family.id) continue;
        await tx
          .update(t.residents)
          .set({ familyId: family.id, updatedAt: new Date() })
          .where(eq(t.residents.id, resident.id));
        if (resident.familyId) touchedFamilyIds.add(resident.familyId);
      }
      touchedFamilyIds.add(family.id);
    }

    let updated = family;
    if (changedKeys.length) {
      const [row] = await tx
        .update(t.families)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(t.families.id, family.id))
        .returning();
      if (!row) throw new DomainError("Kartu keluarga tidak ditemukan", "FAMILY_NOT_FOUND", 404);
      updated = row;
    }

    for (const touchedId of touchedFamilyIds) {
      await syncFamilyMemberCount(tx, touchedId);
    }

    const [withCount] = await tx
      .select()
      .from(t.families)
      .where(eq(t.families.id, family.id))
      .limit(1);

    await writeAudit(tx, input.villageId, {
      kind: "PERUBAHAN_DATA",
      summary: `Kartu Keluarga ${updated.kkNumber} atas nama ${updated.headName} diperbarui oleh ${staff.jobTitle}.`,
      subjectType: "family",
      subjectId: updated.id,
      subjectRef: updated.kkNumber,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: {
        changedFields: membersChanged ? [...changedKeys, "memberIds"] : changedKeys,
        memberCount: withCount?.memberCount ?? updated.memberCount,
      },
    });

    return withCount ?? updated;
  });
}

/**
 * Deletes a Kartu Keluarga. Members are released — they stay in the registry,
 * recorded without a KK number — and the audit row lists who was released.
 */
export async function deleteFamily(input: {
  villageId: string;
  staffId: string;
  familyId: string;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const family = await loadFamily(tx, input.villageId, input.familyId);

    const members = await tx
      .select({ id: t.residents.id, nik: t.residents.nik })
      .from(t.residents)
      .where(eq(t.residents.familyId, family.id));

    if (members.length) {
      await tx
        .update(t.residents)
        .set({ familyId: null, updatedAt: new Date() })
        .where(eq(t.residents.familyId, family.id));
    }

    await tx.delete(t.families).where(eq(t.families.id, family.id));

    await writeAudit(tx, input.villageId, {
      kind: "PENGHAPUSAN_DATA",
      summary: `Kartu Keluarga ${family.kkNumber} atas nama ${family.headName} dihapus; ${members.length} anggota dilepas dari kartu keluarga.`,
      subjectType: "family",
      subjectId: family.id,
      subjectRef: family.kkNumber,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: {
        kkNumber: family.kkNumber,
        headName: family.headName,
        releasedMemberIds: members.map((member) => member.id),
        releasedNiks: members.map((member) => member.nik),
      },
    });

    return {
      id: family.id,
      kkNumber: family.kkNumber,
      headName: family.headName,
      releasedMemberIds: members.map((member) => member.id),
    };
  });
}

/**
 * Provisions the portal login for a resident. Audited as a security event:
 * only the fact of provisioning is recorded, never the password itself.
 */
export async function createResidentAccount(input: {
  villageId: string;
  staffId: string;
  draft: ResidentAccountDraft;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const resident = await loadResident(tx, input.villageId, input.draft.residentId);

    const [existing] = await tx
      .select({ id: t.residentAccounts.id })
      .from(t.residentAccounts)
      .where(eq(t.residentAccounts.residentId, resident.id))
      .limit(1);
    if (existing) {
      throw new DomainError(
        `Akun portal untuk ${resident.fullName} sudah tersedia.`,
        "ACCOUNT_EXISTS",
        409,
      );
    }

    const [nikTaken] = await tx
      .select({ id: t.residentAccounts.id })
      .from(t.residentAccounts)
      .where(eq(t.residentAccounts.nik, resident.nik))
      .limit(1);
    if (nikTaken) {
      throw new DomainError(
        `NIK ${resident.nik} sudah dipakai oleh akun portal lain.`,
        "NIK_DUPLICATE",
        409,
      );
    }

    const [account] = await tx
      .insert(t.residentAccounts)
      .values({
        villageId: input.villageId,
        residentId: resident.id,
        nik: resident.nik,
        passwordHash: hashPassword(input.draft.password),
        active: true,
        failedAttempts: 0,
        lockedUntil: null,
      })
      .returning();

    await writeAudit(tx, input.villageId, {
      kind: "KEAMANAN_AKUN",
      summary: `Akun portal warga dibuat untuk ${resident.fullName} (NIK ${resident.nik}) oleh ${staff.jobTitle}.`,
      subjectType: "resident_account",
      subjectId: account.id,
      subjectRef: account.nik,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: { residentId: resident.id, nik: resident.nik, active: account.active },
    });

    return {
      id: account.id,
      residentId: account.residentId,
      nik: account.nik,
      active: account.active,
      createdAt: account.createdAt,
    };
  });
}

export async function resetResidentAccountPassword(input: {
  villageId: string;
  staffId: string;
  residentId: string;
  password: string;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const resident = await loadResident(tx, input.villageId, input.residentId);

    const [account] = await tx
      .select()
      .from(t.residentAccounts)
      .where(eq(t.residentAccounts.residentId, resident.id))
      .limit(1);
    if (!account) {
      throw new DomainError(
        `Akun portal untuk ${resident.fullName} belum tersedia. Buat akun terlebih dahulu.`,
        "ACCOUNT_NOT_FOUND",
        404,
      );
    }

    await tx
      .update(t.residentAccounts)
      .set({
        passwordHash: hashPassword(input.password),
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(t.residentAccounts.id, account.id));

    const revoked = await revokeResidentSessions(tx, account.id);

    await writeAudit(tx, input.villageId, {
      kind: "KEAMANAN_AKUN",
      summary: `Kata sandi akun portal ${resident.fullName} (NIK ${resident.nik}) direset oleh ${staff.jobTitle}.`,
      subjectType: "resident_account",
      subjectId: account.id,
      subjectRef: account.nik,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      // Attempts and outcome only — never the password that was set.
      meta: {
        residentId: resident.id,
        nik: resident.nik,
        scope: "password_reset",
        sessionsRevoked: revoked,
      },
    });

    return {
      id: account.id,
      residentId: account.residentId,
      nik: account.nik,
      active: account.active,
      sessionsRevoked: revoked,
    };
  });
}

/** Kills every live portal session belonging to one resident account. */
async function revokeResidentSessions(tx: DbOrTx, accountId: string) {
  const revoked = await tx
    .update(t.sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(t.sessions.actorType, "RESIDENT"),
        eq(t.sessions.actorId, accountId),
        isNull(t.sessions.revokedAt),
      ),
    )
    .returning({ id: t.sessions.id });
  return revoked.length;
}

/** Switches a resident's portal account between active and inactive. */
export async function setResidentAccountActive(input: {
  villageId: string;
  staffId: string;
  residentId: string;
  active: boolean;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const resident = await loadResident(tx, input.villageId, input.residentId);

    const [account] = await tx
      .select()
      .from(t.residentAccounts)
      .where(eq(t.residentAccounts.residentId, resident.id))
      .limit(1);
    if (!account) {
      throw new DomainError(
        `Akun portal untuk ${resident.fullName} belum tersedia. Buat akun terlebih dahulu.`,
        "ACCOUNT_NOT_FOUND",
        404,
      );
    }

    await tx
      .update(t.residentAccounts)
      .set({ active: input.active, updatedAt: new Date() })
      .where(eq(t.residentAccounts.id, account.id));

    // A deactivated account must lose its live sessions immediately.
    const sessionsRevoked = input.active ? 0 : await revokeResidentSessions(tx, account.id);

    await writeAudit(tx, input.villageId, {
      kind: "KEAMANAN_AKUN",
      summary: `Akun portal warga ${resident.fullName} (NIK ${resident.nik}) ${input.active ? "diaktifkan" : "dinonaktifkan"} oleh ${staff.jobTitle}.`,
      subjectType: "resident_account",
      subjectId: account.id,
      subjectRef: account.nik,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: {
        residentId: resident.id,
        nik: resident.nik,
        active: input.active,
        sessionsRevoked,
      },
    });

    return {
      id: account.id,
      residentId: account.residentId,
      nik: account.nik,
      active: input.active,
      sessionsRevoked,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Wilayah administratif (capability: manageArea)                              */
/* -------------------------------------------------------------------------- */

async function loadHamlet(tx: DbOrTx, villageId: string, hamletId: string) {
  const [row] = await tx
    .select()
    .from(t.hamlets)
    .where(and(eq(t.hamlets.id, hamletId), eq(t.hamlets.villageId, villageId)))
    .limit(1);
  if (!row) throw new DomainError("Dusun tidak ditemukan", "HAMLET_NOT_FOUND", 404);
  return row;
}

async function loadNeighborhoodRow(tx: DbOrTx, villageId: string, neighborhoodId: string) {
  const [row] = await tx
    .select()
    .from(t.neighborhoods)
    .innerJoin(t.hamlets, eq(t.hamlets.id, t.neighborhoods.hamletId))
    .where(and(eq(t.neighborhoods.id, neighborhoodId), eq(t.hamlets.villageId, villageId)))
    .limit(1);
  if (!row) throw new DomainError("Wilayah RT/RW tidak ditemukan", "NEIGHBORHOOD_NOT_FOUND", 404);
  return row;
}

/** The short label read models print: `"Dusun 01 - Cikembang"` → `"Dusun 01"`. */
function shortHamletLabel(name: string) {
  return name.split(" - ")[0];
}

function rtRwLabel(rt: number, rw: number) {
  return `RT ${String(rt).padStart(2, "0")}/RW ${String(rw).padStart(2, "0")}`;
}

export async function createHamlet(input: {
  villageId: string;
  staffId: string;
  draft: HamletDraft;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);

    const [existing] = await tx
      .select({ id: t.hamlets.id, name: t.hamlets.name })
      .from(t.hamlets)
      .where(and(eq(t.hamlets.villageId, input.villageId), eq(t.hamlets.code, input.draft.code)))
      .limit(1);
    if (existing) {
      throw new DomainError(
        `Kode dusun ${input.draft.code} sudah dipakai oleh ${existing.name}.`,
        "HAMLET_CODE_DUPLICATE",
        409,
      );
    }

    const [hamlet] = await tx
      .insert(t.hamlets)
      .values({
        villageId: input.villageId,
        name: input.draft.name,
        code: input.draft.code,
        headName: input.draft.headName ?? null,
      })
      .returning();

    await writeAudit(tx, input.villageId, {
      kind: "PERUBAHAN_WILAYAH",
      summary: `Dusun ${hamlet.name} (${hamlet.code}) ditambahkan ke wilayah desa oleh ${staff.jobTitle}.`,
      subjectType: "hamlet",
      subjectId: hamlet.id,
      subjectRef: hamlet.code,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: { code: hamlet.code, name: hamlet.name, headName: hamlet.headName },
    });

    return hamlet;
  });
}

export async function updateHamlet(input: {
  villageId: string;
  staffId: string;
  hamletId: string;
  draft: HamletUpdate;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const hamlet = await loadHamlet(tx, input.villageId, input.hamletId);

    if (input.draft.code && input.draft.code !== hamlet.code) {
      const [existing] = await tx
        .select({ id: t.hamlets.id, name: t.hamlets.name })
        .from(t.hamlets)
        .where(and(eq(t.hamlets.villageId, input.villageId), eq(t.hamlets.code, input.draft.code)))
        .limit(1);
      if (existing) {
        throw new DomainError(
          `Kode dusun ${input.draft.code} sudah dipakai oleh ${existing.name}.`,
          "HAMLET_CODE_DUPLICATE",
          409,
        );
      }
    }

    const patch: Partial<typeof t.hamlets.$inferInsert> = {};
    if (input.draft.name !== undefined) patch.name = input.draft.name;
    if (input.draft.code !== undefined) patch.code = input.draft.code;
    if (input.draft.headName !== undefined) patch.headName = input.draft.headName;
    if (!Object.keys(patch).length) {
      throw new DomainError("Tidak ada data yang diubah", "VALIDATION_ERROR", 422);
    }

    const [updated] = await tx
      .update(t.hamlets)
      .set(patch)
      .where(eq(t.hamlets.id, hamlet.id))
      .returning();

    await writeAudit(tx, input.villageId, {
      kind: "PERUBAHAN_WILAYAH",
      summary: `Dusun ${updated.name} (${updated.code}) diperbarui oleh ${staff.jobTitle}.`,
      subjectType: "hamlet",
      subjectId: updated.id,
      subjectRef: updated.code,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: {
        changedFields: Object.keys(patch),
        from: { name: hamlet.name, code: hamlet.code },
        to: { name: updated.name, code: updated.code },
      },
    });

    return updated;
  });
}

export async function deleteHamlet(input: {
  villageId: string;
  staffId: string;
  hamletId: string;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const hamlet = await loadHamlet(tx, input.villageId, input.hamletId);

    const countsResult = await tx.execute<{
      neighborhoods: number;
      residents: number;
      families: number;
      requests: number;
    }>(sql`
      select (select count(*)::int from neighborhoods n where n.hamlet_id = ${hamlet.id}) as neighborhoods,
             (select count(*)::int from residents r
                join neighborhoods n on n.id = r.neighborhood_id
               where n.hamlet_id = ${hamlet.id}) as residents,
             (select count(*)::int from families f
                join neighborhoods n on n.id = f.neighborhood_id
               where n.hamlet_id = ${hamlet.id}) as families,
             (select count(*)::int from letter_requests lr
                join neighborhoods n on n.id = lr.neighborhood_id
               where n.hamlet_id = ${hamlet.id}) as requests
    `);
    const c = countsResult.rows[0] ?? {
      neighborhoods: 0,
      residents: 0,
      families: 0,
      requests: 0,
    };

    if (c.neighborhoods + c.residents + c.families + c.requests > 0) {
      throw new DomainError(
        `Dusun ${shortHamletLabel(hamlet.name)} masih menaungi ${c.neighborhoods} RT/RW, ${c.residents} penduduk, dan ${c.families} kartu keluarga${c.requests ? ` serta ${c.requests} pengajuan surat` : ""}. Pindahkan mereka ke wilayah lain sebelum menghapus.`,
        "AREA_IN_USE",
        409,
      );
    }

    await tx.delete(t.hamlets).where(eq(t.hamlets.id, hamlet.id));

    await writeAudit(tx, input.villageId, {
      kind: "PERUBAHAN_WILAYAH",
      summary: `Dusun ${hamlet.name} (${hamlet.code}) dihapus dari wilayah desa oleh ${staff.jobTitle}.`,
      subjectType: "hamlet",
      subjectId: hamlet.id,
      subjectRef: hamlet.code,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: { code: hamlet.code, name: hamlet.name },
    });

    // Deleting an area invalidates printed addresses — tell the officers.
    await notifyOfficers(tx, input.villageId, {
      title: `Dusun ${shortHamletLabel(hamlet.name)} dihapus`,
      body: `Wilayah ${hamlet.name} (${hamlet.code}) tidak lagi aktif. Periksa kembali alamat yang merujuk dusun ini.`,
      severity: "WARNING",
      href: "/wilayah",
      subjectType: "hamlet",
      subjectId: hamlet.id,
      subjectRef: hamlet.code,
    });

    return { id: hamlet.id, code: hamlet.code, name: hamlet.name };
  });
}

export async function createNeighborhood(input: {
  villageId: string;
  staffId: string;
  draft: NeighborhoodDraft;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const hamlet = await loadHamlet(tx, input.villageId, input.draft.hamletId);

    const [existing] = await tx
      .select({ id: t.neighborhoods.id })
      .from(t.neighborhoods)
      .where(
        and(
          eq(t.neighborhoods.hamletId, hamlet.id),
          eq(t.neighborhoods.rt, input.draft.rt),
          eq(t.neighborhoods.rw, input.draft.rw),
        ),
      )
      .limit(1);
    if (existing) {
      throw new DomainError(
        `${rtRwLabel(input.draft.rt, input.draft.rw)} sudah terdaftar di Dusun ${shortHamletLabel(hamlet.name)}.`,
        "NEIGHBORHOOD_DUPLICATE",
        409,
      );
    }

    const [neighborhood] = await tx
      .insert(t.neighborhoods)
      .values({
        hamletId: hamlet.id,
        rt: input.draft.rt,
        rw: input.draft.rw,
        headName: input.draft.headName ?? null,
      })
      .returning();

    await writeAudit(tx, input.villageId, {
      kind: "PERUBAHAN_WILAYAH",
      summary: `${rtRwLabel(neighborhood.rt, neighborhood.rw)} ditambahkan ke Dusun ${shortHamletLabel(hamlet.name)} oleh ${staff.jobTitle}.`,
      subjectType: "neighborhood",
      subjectId: neighborhood.id,
      subjectRef: `${hamlet.code}·${neighborhood.rt}/${neighborhood.rw}`,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: { hamletId: hamlet.id, hamletCode: hamlet.code, rt: neighborhood.rt, rw: neighborhood.rw },
    });

    return neighborhood;
  });
}

export async function updateNeighborhood(input: {
  villageId: string;
  staffId: string;
  neighborhoodId: string;
  draft: NeighborhoodUpdate;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const current = await loadNeighborhoodRow(tx, input.villageId, input.neighborhoodId);
    const row = current.neighborhoods;
    const oldHamlet = current.hamlets;

    const nextHamletId = input.draft.hamletId ?? row.hamletId;
    const nextRt = input.draft.rt ?? row.rt;
    const nextRw = input.draft.rw ?? row.rw;

    const nextHamlet =
      nextHamletId !== row.hamletId
        ? await loadHamlet(tx, input.villageId, nextHamletId)
        : oldHamlet;

    const moved = nextHamletId !== row.hamletId || nextRt !== row.rt || nextRw !== row.rw;
    if (moved) {
      const [existing] = await tx
        .select({ id: t.neighborhoods.id })
        .from(t.neighborhoods)
        .where(
          and(
            eq(t.neighborhoods.hamletId, nextHamletId),
            eq(t.neighborhoods.rt, nextRt),
            eq(t.neighborhoods.rw, nextRw),
            sql`${t.neighborhoods.id} <> ${row.id}`,
          ),
        )
        .limit(1);
      if (existing) {
        throw new DomainError(
          `${rtRwLabel(nextRt, nextRw)} sudah terdaftar di Dusun ${shortHamletLabel(nextHamlet.name)}.`,
          "NEIGHBORHOOD_DUPLICATE",
          409,
        );
      }
    }

    const patch: Partial<typeof t.neighborhoods.$inferInsert> = {};
    if (nextHamletId !== row.hamletId) patch.hamletId = nextHamletId;
    if (nextRt !== row.rt) patch.rt = nextRt;
    if (nextRw !== row.rw) patch.rw = nextRw;
    if (input.draft.headName !== undefined) patch.headName = input.draft.headName;
    if (!Object.keys(patch).length) {
      throw new DomainError("Tidak ada data yang diubah", "VALIDATION_ERROR", 422);
    }

    const [updated] = await tx
      .update(t.neighborhoods)
      .set(patch)
      .where(eq(t.neighborhoods.id, row.id))
      .returning();

    const reparented = patch.hamletId !== undefined;

    await writeAudit(tx, input.villageId, {
      kind: "PERUBAHAN_WILAYAH",
      summary: `${rtRwLabel(updated.rt, updated.rw)} di Dusun ${shortHamletLabel(nextHamlet.name)} diperbarui oleh ${staff.jobTitle}.`,
      subjectType: "neighborhood",
      subjectId: updated.id,
      subjectRef: `${nextHamlet.code}·${updated.rt}/${updated.rw}`,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: {
        changedFields: Object.keys(patch),
        from: { hamletCode: oldHamlet.code, rt: row.rt, rw: row.rw },
        to: { hamletCode: nextHamlet.code, rt: updated.rt, rw: updated.rw },
      },
    });

    // Re-parenting rewrites every address printed for this RT/RW.
    if (reparented) {
      await notifyOfficers(tx, input.villageId, {
        title: `${rtRwLabel(updated.rt, updated.rw)} pindah dusun`,
        body: `Wilayah ${rtRwLabel(updated.rt, updated.rw)} dipindahkan dari Dusun ${shortHamletLabel(oldHamlet.name)} ke Dusun ${shortHamletLabel(nextHamlet.name)}. Alamat warga ikut berubah.`,
        severity: "WARNING",
        href: "/wilayah",
        subjectType: "neighborhood",
        subjectId: updated.id,
        subjectRef: `${nextHamlet.code}·${updated.rt}/${updated.rw}`,
      });
    }

    return updated;
  });
}

export async function deleteNeighborhood(input: {
  villageId: string;
  staffId: string;
  neighborhoodId: string;
}) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    const current = await loadNeighborhoodRow(tx, input.villageId, input.neighborhoodId);
    const row = current.neighborhoods;
    const hamlet = current.hamlets;

    const countsResult = await tx.execute<{
      residents: number;
      families: number;
      requests: number;
    }>(sql`
      select (select count(*)::int from residents r where r.neighborhood_id = ${row.id}) as residents,
             (select count(*)::int from families f where f.neighborhood_id = ${row.id}) as families,
             (select count(*)::int from letter_requests lr where lr.neighborhood_id = ${row.id}) as requests
    `);
    const c = countsResult.rows[0] ?? { residents: 0, families: 0, requests: 0 };

    if (c.residents + c.families + c.requests > 0) {
      throw new DomainError(
        `${rtRwLabel(row.rt, row.rw)} ini masih menaungi ${c.residents} penduduk dan ${c.families} kartu keluarga${c.requests ? ` serta ${c.requests} pengajuan surat` : ""}. Pindahkan mereka ke wilayah lain sebelum menghapus.`,
        "AREA_IN_USE",
        409,
      );
    }

    await tx.delete(t.neighborhoods).where(eq(t.neighborhoods.id, row.id));

    await writeAudit(tx, input.villageId, {
      kind: "PERUBAHAN_WILAYAH",
      summary: `${rtRwLabel(row.rt, row.rw)} di Dusun ${shortHamletLabel(hamlet.name)} dihapus oleh ${staff.jobTitle}.`,
      subjectType: "neighborhood",
      subjectId: row.id,
      subjectRef: `${hamlet.code}·${row.rt}/${row.rw}`,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: { hamletId: hamlet.id, hamletCode: hamlet.code, rt: row.rt, rw: row.rw },
    });

    // Deleting an area invalidates printed addresses — tell the officers.
    await notifyOfficers(tx, input.villageId, {
      title: `${rtRwLabel(row.rt, row.rw)} dihapus`,
      body: `Wilayah ${rtRwLabel(row.rt, row.rw)} Dusun ${shortHamletLabel(hamlet.name)} tidak lagi aktif.`,
      severity: "WARNING",
      href: "/wilayah",
      subjectType: "neighborhood",
      subjectId: row.id,
      subjectRef: `${hamlet.code}·${row.rt}/${row.rw}`,
    });

    return { id: row.id, rt: row.rt, rw: row.rw, hamletId: hamlet.id };
  });
}