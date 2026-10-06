/**
 * Write layer.
 *
 * Every state transition runs inside a transaction and appends to
 * `activity_log` before it commits. That combination is what makes the
 * "Aktivitas Pelayanan Terkini" panel a genuine audit trail rather than a
 * presentation-only feed: if the log insert fails, the state change rolls back.
 */
import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "./client";
import * as t from "./schema";
import type { AnnouncementDraft, VerifyRequestInput } from "@/lib/validators";
import { REQUEST_STATUS } from "@/lib/domain";
import { verifyPassword } from "@/lib/auth/password";
import { hashPassword } from "@/lib/auth/password";
import {
  LOCKOUT_MS,
  MAX_SIGN_ATTEMPTS,
  lockoutMinutesLeft,
} from "@/lib/auth/policy";
import type { RequestStatus } from "./schema";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

type Db = Awaited<ReturnType<typeof getDb>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Commands run either on the pool or inside a transaction. */
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

/** Accepts both the plain db handle and an in-flight transaction. */
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

/**
 * Audit write for events that happen *outside* a domain transaction — logins,
 * logouts, rejected credentials. Writing it standalone means a rollback
 * elsewhere can never silently swallow an accountability record.
 *
 * As everywhere else: never include passwords or passphrases, only outcomes.
 */
export async function appendAudit(villageId: string, entry: AuditEntry) {
  const db = await getDb();
  await writeAudit(db, villageId, entry);
}

/** Starts a shift for a staff member if none is open — login is the clock-in. */
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

/** Closes every open shift of a staff member — logout is the clock-out. */
export async function closeOpenStaffShifts(staffId: string) {
  const db = await getDb();
  await db
    .update(t.staffShifts)
    .set({ endedAt: new Date() })
    .where(and(eq(t.staffShifts.staffId, staffId), isNull(t.staffShifts.endedAt)));
}

/** Resets the e-sign failure counters after a successful ceremony. */
async function resetSignAttempts(db: Db, staffId: string) {
  await db
    .update(t.staff)
    .set({ signAttempts: 0, signLockedUntil: null })
    .where(eq(t.staff.id, staffId));
}

/**
 * Records a failed e-sign passphrase attempt and locks the certificate after
 * too many. Returns the state the caller needs for an accurate (but never
 * secret-revealing) message.
 */
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

/* -------------------------------------------------------------------------- */
/* Verification — Setujui / Minta Perbaikan / Tolak                            */
/* -------------------------------------------------------------------------- */

/** Legal next states, so an invalid transition is rejected before SQL runs. */
const ALLOWED_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  PENDING_VERIFIKASI: ["DIVERIFIKASI", "BERKAS_TIDAK_LENGKAP", "DITOLAK"],
  BERKAS_TIDAK_LENGKAP: ["PENDING_VERIFIKASI", "DIVERIFIKASI", "DITOLAK"],
  // SIAP_DIAMBIL is the exit for letter types that need no Kepala Desa
  // signature; every type seeded in this village currently does, so it is a
  // documented branch rather than a travelled one.
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

/**
 * Resolves where "Setujui" lands from the current status.
 *
 * Verification is a two-desk workflow: the operator attests that the file is
 * complete (PENDING_VERIFIKASI → DIVERIFIKASI), and forwarding it to the Kepala
 * Desa is a separate step (DIVERIFIKASI → MENUNGGU_TTD_KADES). Officers work
 * from one button, so the command maps that intent onto the legal next step
 * instead of making them memorise the state machine — clicking Setujui twice
 * walks the request through both desks.
 */
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

  // Credential gate first, deliberately outside the ceremony transaction:
  // failed-attempt bookkeeping must survive even though nothing else changes.
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

  // The ceremony is the last gate before a document becomes legally valid, so
  // the passphrase is actually verified — an unactivated credential fails
  // closed instead of signing with whatever was typed.
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

/**
 * Self-service activation (or rotation) of the signer's e-sign passphrase.
 *
 * A signer with `canSign` can bootstrap their own credential while logged in;
 * once one exists, rotating it requires the current passphrase, so a stray
 * browser can never silently take over the certificate.
 */
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

/* -------------------------------------------------------------------------- */
/* Letter press                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Records a print run. Called by the PDF route so a download and its audit
 * entry can never diverge.
 */
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

    // A final print is the moment the document leaves the village's custody.
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

/* -------------------------------------------------------------------------- */
/* Resident portal downloads                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Audits a resident downloading their own signed letter from the portal.
 *
 * Deliberately audit-only: unlike a loket print run it does not advance the
 * request lifecycle — the letter only leaves the village's custody when it is
 * handed over at the counter.
 */
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

/* -------------------------------------------------------------------------- */
/* Citizen reports                                                             */
/* -------------------------------------------------------------------------- */

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

    const [report] = await tx
      .update(t.citizenReports)
      .set({
        status: input.status,
        handledByStaffId: staff.id,
        resolvedAt: input.status === "RESOLVED" ? new Date() : null,
        responseCount: sql`${t.citizenReports.responseCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(t.citizenReports.id, input.reportId),
          eq(t.citizenReports.villageId, input.villageId),
        ),
      )
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