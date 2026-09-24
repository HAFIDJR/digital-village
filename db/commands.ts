/**
 * Write layer.
 *
 * Every state transition runs inside a transaction and appends to
 * `activity_log` before it commits. That combination is what makes the
 * "Aktivitas Pelayanan Terkini" panel a genuine audit trail rather than a
 * presentation-only feed: if the log insert fails, the state change rolls back.
 */
import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "./client";
import * as t from "./schema";
import type { AnnouncementDraft, VerifyRequestInput } from "@/lib/validators";
import { REQUEST_STATUS } from "@/lib/domain";
import { verifyPassphrase } from "@/lib/esign-server";
import type { RequestStatus } from "./schema";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

type Db = Awaited<ReturnType<typeof getDb>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

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

async function writeAudit(tx: Tx, villageId: string, entry: AuditEntry) {
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

async function loadStaff(tx: Tx, staffId: string) {
  const [row] = await tx.select().from(t.staff).where(eq(t.staff.id, staffId)).limit(1);
  if (!row) throw new DomainError("Petugas tidak ditemukan", "STAFF_NOT_FOUND", 404);
  if (!row.active) throw new DomainError("Akun petugas tidak aktif", "STAFF_INACTIVE", 403);
  return row;
}

async function loadRequest(tx: Tx, villageId: string, requestId: string) {
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

  return db.transaction(async (tx) => {
    const staff = await loadStaff(tx, input.staffId);
    if (!staff.canSign) {
      throw new DomainError(
        "Hanya Kepala Desa yang berwenang menandatangani surat.",
        "NOT_AUTHORISED_SIGNER",
        403,
      );
    }

    // The ceremony is the last gate before a document becomes legally valid, so
    // the passphrase is actually verified — an unactivated credential fails
    // closed instead of signing with whatever was typed.
    if (!staff.signaturePassphraseHash) {
      throw new DomainError(
        "Sertifikat tanda tangan elektronik pejabat ini belum diaktivasi. Hubungi administrator desa.",
        "SIGNATURE_NOT_ACTIVATED",
        409,
      );
    }
    if (!verifyPassphrase(input.passphrase, staff.signaturePassphraseHash)) {
      throw new DomainError(
        "Frasa sandi sertifikat tidak sesuai. Periksa kembali frasa sandi BSrE Anda.",
        "INVALID_PASSPHRASE",
        401,
      );
    }

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
