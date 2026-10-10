import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "./client";
import * as t from "./schema";
import type {
  AnnouncementDraft,
  FamilyDraft,
  LetterAttachmentManifest,
  LetterRequestDraft,
  ReportDraft,
  ResidentAccountDraft,
  ResidentDraft,
  ResidentUpdate,
  VerifyRequestInput,
} from "@/lib/validators";
import {
  MUTATION_KIND,
  REPORT_CATEGORY,
  REPORT_STATUS,
  REQUEST_STATUS,
  notificationSeverity,
} from "@/lib/domain";
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

/**
 * Next human reference in the "SRT-1049" series: the highest number already
 * issued for the prefix plus one. The unique index on `ticket` is the final
 * guard — this only keeps the sequence readable.
 */
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

/** Keeps `families.member_count` truthful after members are added or removed. */
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

/** Broadcast to every officer in the village (`recipient_staff_id` stays NULL). */
async function notifyOfficers(
  tx: DbOrTx,
  villageId: string,
  entry: { title: string; body: string; severity: string; href: string },
) {
  await tx.insert(t.notifications).values({
    villageId,
    recipientStaffId: null,
    title: entry.title,
    body: entry.body,
    severity: entry.severity,
    href: entry.href,
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
          href: `/?request=${request.id}`,
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

/**
 * Files a resident through the portal and drops the request straight into the
 * officer queue as `PENDING_VERIFIKASI` with its SLA countdown already running.
 */
export async function createLetterRequest(input: {
  villageId: string;
  residentId: string;
  draft: LetterRequestDraft & { attachments: StoredLetterAttachment[] };
  /**
   * Id the caller already reserved — the route needs it up front so the uploaded
   * scans can be stored under `requests/<id>/…` before the row is written.
   */
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
      href: "/antrean",
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

/* -------------------------------------------------------------------------- */
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

export async function markNotificationsRead(villageId: string, staffId: string, ids?: string[]) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    const now = new Date();
    const predicate = and(
      eq(t.notifications.villageId, villageId),
      eq(t.notifications.recipientStaffId, staffId),
      sql`${t.notifications.readAt} is null`,
      ids?.length ? inArray(t.notifications.id, ids) : sql`true`,
    );

    const updated = await tx
      .update(t.notifications)
      .set({ readAt: now })
      .where(predicate)
      .returning({ id: t.notifications.id });

    return { updated: updated.length };
  });
}

/**
 * Marks portal announcements as read for one resident. Read state is stored
 * per resident/announcement, so a broadcast that arrives later is unread again.
 */
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
export async function createCitizenReport(input: {
  villageId: string;
  residentId: string | null;
  /** Officer recording a counter filing; null when the resident submits online. */
  staffId?: string | null;
  draft: ReportDraft;
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
        submittedAt,
      })
      .returning();

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
      },
    });

    await notifyOfficers(tx, input.villageId, {
      title: `Laporan baru ${ticket} — ${categoryLabel}`,
      body: `${input.draft.subject} dilaporkan oleh ${reporter.name} (${location}).`,
      severity: notificationSeverity(input.draft.priority),
      href: "/laporan",
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

    // A closed report is archived material: reopening it belongs in a new ticket.
    if (current.status === "RESOLVED" || current.status === "REJECTED") {
      throw new DomainError(
        `Laporan ${current.ticket} sudah ditutup (${REPORT_STATUS[current.status]?.label ?? current.status}).`,
        "INVALID_TRANSITION",
        409,
      );
    }

    const [report] = await tx
      .update(t.citizenReports)
      .set({
        status: input.status,
        handledByStaffId: staff.id,
        resolvedAt: input.status === "RESOLVED" ? new Date() : null,
        responseCount: sql`${t.citizenReports.responseCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(t.citizenReports.id, input.reportId))
      .returning();

    if (!report) throw new DomainError("Laporan tidak ditemukan", "REPORT_NOT_FOUND", 404);

    await writeAudit(tx, input.villageId, {
      kind: "PERSETUJUAN",
      summary: `Laporan ${report.ticket} — "${report.subject}" ditandai ${input.status === "RESOLVED" ? "selesai" : input.status === "IN_PROGRESS" ? "sedang dikerjakan" : "ditolak"}.`,
      subjectType: "citizen_report",
      subjectId: report.id,
      subjectRef: report.ticket,
      actor: { id: staff.id, name: staff.fullName, initials: staff.initials, role: staff.jobTitle },
      meta: { status: input.status, note: input.note ?? null },
    });

    return report;
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
      // Never the password — only that it was provisioned and by whom.
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
