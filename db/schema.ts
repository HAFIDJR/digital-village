/**
 * Digital Village — relational schema (PostgreSQL 18)
 *
 * Conventions enforced across every table:
 *  - snake_case identifiers, `id` uuid primary keys for public-facing entities.
 *  - Every mutable row carries created_at / updated_at (timestamptz).
 *  - Every state transition on a service request is append-only logged in
 *    `activity_log`. The log is the system of record for the audit trail
 *    required by Permendagri 73/2020 on village information systems.
 *  - Status columns are real Postgres enums, not varchar + check constraints,
 *    so an invalid state can never be written by a buggy client.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/* ==========================================================================
   ENUMS — the domain's canonical state vocabulary
   ========================================================================== */

export const genderEnum = pgEnum("gender", ["L", "P"]);

export const religionEnum = pgEnum("religion", [
  "ISLAM",
  "KRISTEN",
  "KATOLIK",
  "HINDU",
  "BUDDHA",
  "KONGHUCU",
  "LAINNYA",
]);

export const maritalStatusEnum = pgEnum("marital_status", [
  "BELUM_MENIKAH",
  "KAWIN",
  "CERAI_HIDUP",
  "CERAI_MATI",
]);

export const residentStatusEnum = pgEnum("resident_status", [
  "AKTIF",
  "PINDAH_KELUAR",
  "MENINGGAL",
  "TIDAK_DIKENAL",
]);

/** Full lifecycle of a citizen letter request. */
export const requestStatusEnum = pgEnum("request_status", [
  "PENDING_VERIFIKASI",
  "BERKAS_TIDAK_LENGKAP",
  "DIVERIFIKASI",
  "MENUNGGU_TTD_KADES",
  "DITANDATANGANI",
  "SIAP_DIAMBIL",
  "SELESAI",
  "DITOLAK",
]);

/** Scanned-file quality verdict reached by the verifying officer. */
export const attachmentStatusEnum = pgEnum("attachment_status", [
  "LENGKAP",
  "BURAM", // "KTP Buram" — legible enough to read, not enough to archive
  "TIDAK_ADA",
  "TIDAK_RELEVAN",
]);

export const staffRoleEnum = pgEnum("staff_role", [
  "OPERATOR_DESA",
  "SEKDES",
  "KASI_PELAYANAN",
  "KAUR_TU",
  "KADES",
  "KADUS",
]);

export const priorityEnum = pgEnum("priority", ["NORMAL", "PRIORITAS", "DARURAT"]);

export const announcementChannelEnum = pgEnum("announcement_channel", [
  "WEBSITE_DESA",
  "PAPAN_INFORMASI",
  "PENGUMUMAN_WA",
]);

export const announcementStatusEnum = pgEnum("announcement_status", [
  "DRAF",
  "TERJADWAL",
  "TERBIT",
  "DIARSIPKAN",
]);

export const activityKindEnum = pgEnum("activity_kind", [
  "PENGAJUAN_BARU",
  "VERIFIKASI_BERKAS",
  "PENOLAKAN",
  "PERSETUJUAN",
  "TANDA_TANGAN",
  "CETAK_SURAT",
  "MUTASI_PENDUDUK",
  "PENGUMUMAN",
  "MASUK_LOG",
]);

export const signatureStatusEnum = pgEnum("signature_status", [
  "MENUNGGU",
  "DITANDATANGANI",
  "KEDALUWARSA",
  "DIBATALKAN",
]);

/* ==========================================================================
   VILLAGE PROFILE  (single-tenant, but keyed for future multi-village)
   ========================================================================== */

export const villages = pgTable("villages", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  district: varchar("district", { length: 120 }).notNull(), // kecamatan
  regency: varchar("regency", { length: 120 }).notNull(), // kabupaten
  province: varchar("province", { length: 120 }).notNull(),
  postalCode: varchar("postal_code", { length: 8 }).notNull(),
  /** 16-digit village code from the Ministry of Home Affairs (Kode Kemendagri). */
  villageCode: varchar("village_code", { length: 16 }).notNull(),
  headName: varchar("head_name", { length: 120 }).notNull(), // Kepala Desa
  headNipd: varchar("head_nipd", { length: 32 }),
  officeAddress: text("office_address").notNull(),
  officePhone: varchar("office_phone", { length: 32 }).notNull(),
  officeEmail: varchar("office_email", { length: 160 }).notNull(),
  website: varchar("website", { length: 160 }),
  /** Public URL of the village seal (lambang desa). */
  sealUrl: text("seal_url"),
  establishedYear: smallint("established_year"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ==========================================================================
   ADMINISTRATIVE DIVISIONS
   ========================================================================== */

export const hamlets = pgTable(
  "hamlets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villageId: uuid("village_id")
      .notNull()
      .references(() => villages.id, { onDelete: "cascade" }),
    /** "Dusun 02" */
    name: varchar("name", { length: 80 }).notNull(),
    code: varchar("code", { length: 16 }).notNull(),
    headName: varchar("head_name", { length: 120 }), // Kepala Dusun
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("hamlets_village_code_uq").on(t.villageId, t.code)],
);

export const neighborhoods = pgTable(
  "neighborhoods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hamletId: uuid("hamlet_id")
      .notNull()
      .references(() => hamlets.id, { onDelete: "cascade" }),
    /** RT number, e.g. 4 */
    rt: smallint("rt").notNull(),
    /** RW number, e.g. 2 */
    rw: smallint("rw").notNull(),
    headName: varchar("head_name", { length: 120 }), // Ketua RT
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("neighborhoods_hamlet_rt_rw_uq").on(t.hamletId, t.rt, t.rw)],
);

/* ==========================================================================
   STAFF  (perangkat desa)
   ========================================================================== */

export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villageId: uuid("village_id")
      .notNull()
      .references(() => villages.id, { onDelete: "cascade" }),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    /** Jabatan, e.g. "Kasi Pelayanan" */
    jobTitle: varchar("job_title", { length: 120 }).notNull(),
    role: staffRoleEnum("role").notNull(),
    nipd: varchar("nipd", { length: 32 }), // NIPD / NIP
    email: varchar("email", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    avatarUrl: text("avatar_url"),
    initials: varchar("initials", { length: 4 }).notNull(),
    /** Staff who can authorise documents with an electronic signature. */
    canSign: boolean("can_sign").notNull().default(false),
    /**
     * scrypt digest of the officer's BSrE passphrase (`scrypt$salt$key`).
     * Null for everyone who is not a signer — the ceremony refuses to run
     * against an unactivated credential rather than signing with any input.
     */
    signaturePassphraseHash: varchar("signature_passphrase_hash", { length: 200 }),
    active: boolean("active").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("staff_email_uq").on(t.email),
    index("staff_village_role_idx").on(t.villageId, t.role),
  ],
);

/** Operational shift log — powers the "shift aktif" indicator in the topbar. */
export const staffShifts = pgTable(
  "staff_shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Pelayanan loket / verifikasi berkas / tanda tangan digital */
    station: varchar("station", { length: 80 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
  },
  (t) => [index("staff_shifts_staff_idx").on(t.staffId, t.startedAt)],
);

/* ==========================================================================
   POPULATION REGISTRY
   ========================================================================== */

export const families = pgTable(
  "families",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villageId: uuid("village_id")
      .notNull()
      .references(() => villages.id, { onDelete: "cascade" }),
    /** 16-digit Kartu Keluarga number. */
    kkNumber: varchar("kk_number", { length: 16 }).notNull(),
    neighborhoodId: uuid("neighborhood_id")
      .notNull()
      .references(() => neighborhoods.id, { onDelete: "restrict" }),
    address: text("address").notNull(),
    headName: varchar("head_name", { length: 120 }).notNull(),
    /** Ekonomi stratum recorded by the village for social assistance mapping. */
    welfareClass: varchar("welfare_class", { length: 32 }),
    memberCount: smallint("member_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("families_kk_uq").on(t.kkNumber),
    index("families_neighborhood_idx").on(t.neighborhoodId),
  ],
);

export const residents = pgTable(
  "residents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villageId: uuid("village_id")
      .notNull()
      .references(() => villages.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").references(() => families.id, { onDelete: "set null" }),
    /** 16-digit Nomor Induk Kependudukan. */
    nik: varchar("nik", { length: 16 }).notNull(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    gender: genderEnum("gender").notNull(),
    birthPlace: varchar("birth_place", { length: 80 }).notNull(),
    birthDate: date("birth_date").notNull(),
    religion: religionEnum("religion").notNull().default("ISLAM"),
    maritalStatus: maritalStatusEnum("marital_status").notNull().default("BELUM_MENIKAH"),
    education: varchar("education", { length: 48 }),
    occupation: varchar("occupation", { length: 80 }),
    nationality: varchar("nationality", { length: 48 }).notNull().default("WNI"),
    /** Family relationship: "KEPALA KELUARGA", "ISTRI", "ANAK", ... */
    familyRelation: varchar("family_relation", { length: 48 }),
    neighborhoodId: uuid("neighborhood_id")
      .notNull()
      .references(() => neighborhoods.id, { onDelete: "restrict" }),
    address: text("address").notNull(),
    phone: varchar("phone", { length: 32 }),
    status: residentStatusEnum("status").notNull().default("AKTIF"),
    /** Blurred / damaged KTP uploads are flagged here after verification. */
    documentsVerified: boolean("documents_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("residents_nik_uq").on(t.nik),
    index("residents_name_idx").on(t.fullName),
    index("residents_village_status_idx").on(t.villageId, t.status),
    index("residents_neighborhood_idx").on(t.neighborhoodId),
  ],
);

/**
 * Population mutations (kelahiran, kematian, pindah datang/keluar).
 * Maintained separately so the registry itself stays append-only friendly.
 */
export const residentMutations = pgTable(
  "resident_mutations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    residentId: uuid("resident_id")
      .notNull()
      .references(() => residents.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(), // KELAHIRAN | KEMATIAN | PINDAH_DATANG | PINDAH_KELUAR
    effectiveDate: date("effective_date").notNull(),
    notes: text("notes"),
    recordedByStaffId: uuid("recorded_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("resident_mutations_resident_idx").on(t.residentId, t.effectiveDate)],
);

/* ==========================================================================
   LETTER SERVICE CATALOGUE
   ========================================================================== */

export const letterTypes = pgTable(
  "letter_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villageId: uuid("village_id")
      .notNull()
      .references(() => villages.id, { onDelete: "cascade" }),
    /** Short badge code shown in the queue: "SKU", "SKCK", "SKD", "SKM" */
    code: varchar("code", { length: 12 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    /** Long-form template heading printed on the PDF. */
    templateTitle: varchar("template_title", { length: 200 }).notNull(),
    description: text("description"),
    /** SLA in working days — drives the "jatuh tempo" countdown in the table. */
    slaDays: smallint("sla_days").notNull().default(2),
    requiresKadesSignature: boolean("requires_kades_signature").notNull().default(true),
    /** Retribusi / biaya administrasi in IDR. 0 = gratis. */
    feeIdr: integer("fee_idr").notNull().default(0),
    active: boolean("active").notNull().default(true),
    sortOrder: smallint("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("letter_types_village_code_uq").on(t.villageId, t.code)],
);

/** Which documents a given letter type requires, and whether they are mandatory. */
export const letterRequirements = pgTable(
  "letter_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    letterTypeId: uuid("letter_type_id")
      .notNull()
      .references(() => letterTypes.id, { onDelete: "cascade" }),
    /** Machine key: KTP | KK | PENGANTAR_RT | AKTA_KELAHIRAN | BUKU_NIKAH | SERTIFIKAT_TANAH */
    docKey: varchar("doc_key", { length: 40 }).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    mandatory: boolean("mandatory").notNull().default(true),
    sortOrder: smallint("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("letter_requirements_uq").on(t.letterTypeId, t.docKey)],
);

/* ==========================================================================
   LETTER REQUESTS — the operational heart of the dashboard
   ========================================================================== */

export const letterRequests = pgTable(
  "letter_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human-facing ticket: "SRT-1049" */
    ticket: varchar("ticket", { length: 20 }).notNull(),
    villageId: uuid("village_id")
      .notNull()
      .references(() => villages.id, { onDelete: "cascade" }),
    letterTypeId: uuid("letter_type_id")
      .notNull()
      .references(() => letterTypes.id, { onDelete: "restrict" }),
    applicantResidentId: uuid("applicant_resident_id").references(() => residents.id, {
      onDelete: "set null",
    }),
    /** Denormalised so the queue still renders if the registry is being resynced. */
    applicantName: varchar("applicant_name", { length: 120 }).notNull(),
    applicantNik: varchar("applicant_nik", { length: 16 }).notNull(),
    applicantPhone: varchar("applicant_phone", { length: 32 }),
    familyId: uuid("family_id").references(() => families.id, { onDelete: "set null" }),
    neighborhoodId: uuid("neighborhood_id")
      .notNull()
      .references(() => neighborhoods.id, { onDelete: "restrict" }),
    address: text("address").notNull(),
    /** Free-form answers to the letter template's variables. */
    purpose: text("purpose").notNull(),
    payload: jsonb("payload").$type<Record<string, string | number | null>>().notNull().default({}),
    status: requestStatusEnum("status").notNull().default("PENDING_VERIFIKASI"),
    priority: priorityEnum("priority").notNull().default("NORMAL"),
    /** Application channel: LOKET | WHATSAPP | WEBSITE */
    channel: varchar("channel", { length: 24 }).notNull().default("WEBSITE"),
    /** Number of uploaded files vs. number required by the letter type. */
    documentsUploaded: smallint("documents_uploaded").notNull().default(0),
    documentsRequired: smallint("documents_required").notNull().default(0),
    /** e.g. "KTP Buram" — first blocking defect surfaced directly in the queue. */
    complianceNote: varchar("compliance_note", { length: 120 }),
    assignedStaffId: uuid("assigned_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    rejectionReason: text("rejection_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    /** SLA deadline; comparisons use this rather than recomputing on each render. */
    dueAt: timestamp("due_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Public verification token embedded in the QR code on the printed letter. */
    verificationCode: varchar("verification_code", { length: 32 }).notNull(),
    /** Monotonic agenda number assigned by the village registry book. */
    agendaNumber: integer("agenda_number"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("letter_requests_ticket_uq").on(t.ticket),
    uniqueIndex("letter_requests_verification_code_uq").on(t.verificationCode),
    index("letter_requests_status_submitted_idx").on(t.status, t.submittedAt),
    index("letter_requests_neighborhood_idx").on(t.neighborhoodId),
    index("letter_requests_nik_idx").on(t.applicantNik),
    index("letter_requests_name_idx").on(t.applicantName),
  ],
);

export const letterAttachments = pgTable(
  "letter_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => letterRequests.id, { onDelete: "cascade" }),
    docKey: varchar("doc_key", { length: 40 }).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    fileName: varchar("file_name", { length: 200 }).notNull(),
    /** Object-store key. Never a public URL — files are streamed through the API. */
    storageKey: text("storage_key").notNull(),
    mimeType: varchar("mime_type", { length: 80 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    status: attachmentStatusEnum("status").notNull().default("LENGKAP"),
    /** Verification defect, e.g. "KTP Buram — mohon unggah ulang". */
    defectNote: varchar("defect_note", { length: 160 }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedByStaffId: uuid("verified_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("letter_attachments_request_idx").on(t.requestId)],
);

/** Electronic signature ceremony for documents authored by the Kepala Desa. */
export const signatureRequests = pgTable(
  "signature_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => letterRequests.id, { onDelete: "cascade" }),
    requestedByStaffId: uuid("requested_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    signerStaffId: uuid("signer_staff_id").references(() => staff.id, { onDelete: "set null" }),
    status: signatureStatusEnum("status").notNull().default("MENUNGGU"),
    /** Passphrase-verified certificate serial issued by BSrE. */
    certificateSerial: varchar("certificate_serial", { length: 64 }),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    note: text("note"),
  },
  (t) => [index("signature_requests_status_idx").on(t.status, t.requestedAt)],
);

/* ==========================================================================
   CITIZEN REPORTS & ASPIRATIONS (laporan / aspirasi warga)
   ========================================================================== */

export const citizenReports = pgTable(
  "citizen_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticket: varchar("ticket", { length: 20 }).notNull(),
    villageId: uuid("village_id")
      .notNull()
      .references(() => villages.id, { onDelete: "cascade" }),
    reporterName: varchar("reporter_name", { length: 120 }).notNull(),
    reporterNik: varchar("reporter_nik", { length: 16 }),
    reporterPhone: varchar("reporter_phone", { length: 32 }),
    neighborhoodId: uuid("neighborhood_id").references(() => neighborhoods.id, {
      onDelete: "set null",
    }),
    category: varchar("category", { length: 60 }).notNull(), // INFRASTRUKTUR | KEBERSIHAN | KEAMANAN | LAYANAN | LAINNYA
    subject: varchar("subject", { length: 200 }).notNull(),
    body: text("body").notNull(),
    /** NEW | IN_PROGRESS | RESOLVED | REJECTED */
    status: varchar("status", { length: 24 }).notNull().default("NEW"),
    priority: priorityEnum("priority").notNull().default("NORMAL"),
    handledByStaffId: uuid("handled_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    responseCount: smallint("response_count").notNull().default(0),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("citizen_reports_ticket_uq").on(t.ticket),
    index("citizen_reports_status_idx").on(t.villageId, t.status, t.submittedAt),
  ],
);

/* ==========================================================================
   ANNOUNCEMENTS / PUBLIC BROADCASTS
   ========================================================================== */

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villageId: uuid("village_id")
      .notNull()
      .references(() => villages.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 220 }).notNull(),
    excerpt: varchar("excerpt", { length: 320 }),
    body: text("body").notNull(),
    channel: announcementChannelEnum("channel").notNull().default("WEBSITE_DESA"),
    status: announcementStatusEnum("status").notNull().default("DRAF"),
    priority: priorityEnum("priority").notNull().default("NORMAL"),
    pinned: boolean("pinned").notNull().default(false),
    /** Attachment allowance for surat edaran PDFs. */
    attachmentCount: smallint("attachment_count").notNull().default(0),
    audience: varchar("audience", { length: 80 }).notNull().default("Seluruh Warga"),
    authorStaffId: uuid("author_staff_id").references(() => staff.id, { onDelete: "set null" }),
    publishAt: timestamp("publish_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    viewCount: integer("view_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("announcements_slug_uq").on(t.villageId, t.slug),
    index("announcements_status_idx").on(t.villageId, t.status, t.publishAt),
  ],
);

/* ==========================================================================
   AUDIT TRAIL & NOTIFICATIONS
   ========================================================================== */

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villageId: uuid("village_id")
      .notNull()
      .references(() => villages.id, { onDelete: "cascade" }),
    kind: activityKindEnum("kind").notNull(),
    /** Short human sentence; rendered verbatim in the activity feed. */
    summary: varchar("summary", { length: 300 }).notNull(),
    /** Optional deep-link context so the feed rows stay clickable. */
    subjectType: varchar("subject_type", { length: 40 }),
    subjectId: uuid("subject_id"),
    subjectRef: varchar("subject_ref", { length: 40 }), // "SRT-1049"
    actorStaffId: uuid("actor_staff_id").references(() => staff.id, { onDelete: "set null" }),
    actorName: varchar("actor_name", { length: 120 }).notNull(),
    actorInitials: varchar("actor_initials", { length: 4 }).notNull(),
    actorRole: varchar("actor_role", { length: 60 }).notNull(),
    /** Extra structured detail — amounts, NIK deltas, QR payloads, etc. */
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activity_log_village_occurred_idx").on(t.villageId, t.occurredAt),
    index("activity_log_subject_idx").on(t.subjectType, t.subjectId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    villageId: uuid("village_id")
      .notNull()
      .references(() => villages.id, { onDelete: "cascade" }),
    /** NULL = broadcast to every officer in the village. */
    recipientStaffId: uuid("recipient_staff_id").references(() => staff.id, {
      onDelete: "cascade",
    }),
    title: varchar("title", { length: 160 }).notNull(),
    body: varchar("body", { length: 320 }),
    severity: varchar("severity", { length: 16 }).notNull().default("INFO"), // INFO | WARNING | CRITICAL | SUCCESS
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_recipient_idx").on(t.recipientStaffId, t.readAt, t.createdAt)],
);

/** Rolling daily operational metrics — avoids full-table scans on the KPI row. */
export const dailyStats = pgTable(
  "daily_stats",
  {
    villageId: uuid("village_id")
      .notNull()
      .references(() => villages.id, { onDelete: "cascade" }),
    statDate: date("stat_date").notNull(),
    lettersReceived: integer("letters_received").notNull().default(0),
    lettersCompleted: integer("letters_completed").notNull().default(0),
    lettersRejected: integer("letters_rejected").notNull().default(0),
    lettersPrinted: integer("letters_printed").notNull().default(0),
    activeResidents: integer("active_residents").notNull().default(0),
    activeFamilies: integer("active_families").notNull().default(0),
    reportsNew: integer("reports_new").notNull().default(0),
    /** Published village budget realisation, in IDR. */
    danaDesaDisbursed: numeric("dana_desa_disbursed", { precision: 16, scale: 2 })
      .notNull()
      .default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.villageId, t.statDate] })],
);

/* ==========================================================================
   RELATIONS  (enables drizzle `db.query.*` with nested includes)
   ========================================================================== */

export const villagesRelations = relations(villages, ({ many }) => ({
  hamlets: many(hamlets),
  staff: many(staff),
  letterTypes: many(letterTypes),
}));

export const hamletsRelations = relations(hamlets, ({ one, many }) => ({
  village: one(villages, { fields: [hamlets.villageId], references: [villages.id] }),
  neighborhoods: many(neighborhoods),
}));

export const neighborhoodsRelations = relations(neighborhoods, ({ one, many }) => ({
  hamlet: one(hamlets, { fields: [neighborhoods.hamletId], references: [hamlets.id] }),
  residents: many(residents),
  requests: many(letterRequests),
}));

export const staffRelations = relations(staff, ({ one, many }) => ({
  village: one(villages, { fields: [staff.villageId], references: [villages.id] }),
  shifts: many(staffShifts),
  assignedRequests: many(letterRequests),
}));

export const staffShiftsRelations = relations(staffShifts, ({ one }) => ({
  staff: one(staff, { fields: [staffShifts.staffId], references: [staff.id] }),
}));

export const familiesRelations = relations(families, ({ one, many }) => ({
  village: one(villages, { fields: [families.villageId], references: [villages.id] }),
  neighborhood: one(neighborhoods, {
    fields: [families.neighborhoodId],
    references: [neighborhoods.id],
  }),
  members: many(residents),
}));

export const residentsRelations = relations(residents, ({ one, many }) => ({
  village: one(villages, { fields: [residents.villageId], references: [villages.id] }),
  family: one(families, { fields: [residents.familyId], references: [families.id] }),
  neighborhood: one(neighborhoods, {
    fields: [residents.neighborhoodId],
    references: [neighborhoods.id],
  }),
  mutations: many(residentMutations),
  requests: many(letterRequests),
}));

export const residentMutationsRelations = relations(residentMutations, ({ one }) => ({
  resident: one(residents, {
    fields: [residentMutations.residentId],
    references: [residents.id],
  }),
  recordedBy: one(staff, {
    fields: [residentMutations.recordedByStaffId],
    references: [staff.id],
  }),
}));

export const letterTypesRelations = relations(letterTypes, ({ one, many }) => ({
  village: one(villages, { fields: [letterTypes.villageId], references: [villages.id] }),
  requirements: many(letterRequirements),
  requests: many(letterRequests),
}));

export const letterRequirementsRelations = relations(letterRequirements, ({ one }) => ({
  letterType: one(letterTypes, {
    fields: [letterRequirements.letterTypeId],
    references: [letterTypes.id],
  }),
}));

export const letterRequestsRelations = relations(letterRequests, ({ one, many }) => ({
  village: one(villages, { fields: [letterRequests.villageId], references: [villages.id] }),
  letterType: one(letterTypes, {
    fields: [letterRequests.letterTypeId],
    references: [letterTypes.id],
  }),
  applicant: one(residents, {
    fields: [letterRequests.applicantResidentId],
    references: [residents.id],
  }),
  family: one(families, { fields: [letterRequests.familyId], references: [families.id] }),
  neighborhood: one(neighborhoods, {
    fields: [letterRequests.neighborhoodId],
    references: [neighborhoods.id],
  }),
  assignedStaff: one(staff, {
    fields: [letterRequests.assignedStaffId],
    references: [staff.id],
  }),
  attachments: many(letterAttachments),
  signatures: many(signatureRequests),
}));

export const letterAttachmentsRelations = relations(letterAttachments, ({ one }) => ({
  request: one(letterRequests, {
    fields: [letterAttachments.requestId],
    references: [letterRequests.id],
  }),
  verifiedBy: one(staff, {
    fields: [letterAttachments.verifiedByStaffId],
    references: [staff.id],
  }),
}));

export const signatureRequestsRelations = relations(signatureRequests, ({ one }) => ({
  request: one(letterRequests, {
    fields: [signatureRequests.requestId],
    references: [letterRequests.id],
  }),
  requestedBy: one(staff, {
    fields: [signatureRequests.requestedByStaffId],
    references: [staff.id],
  }),
  signer: one(staff, { fields: [signatureRequests.signerStaffId], references: [staff.id] }),
}));

export const announcementsRelations = relations(announcements, ({ one }) => ({
  village: one(villages, { fields: [announcements.villageId], references: [villages.id] }),
  author: one(staff, { fields: [announcements.authorStaffId], references: [staff.id] }),
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  village: one(villages, { fields: [activityLog.villageId], references: [villages.id] }),
  actor: one(staff, { fields: [activityLog.actorStaffId], references: [staff.id] }),
}));

export const citizenReportsRelations = relations(citizenReports, ({ one }) => ({
  village: one(villages, { fields: [citizenReports.villageId], references: [villages.id] }),
  neighborhood: one(neighborhoods, {
    fields: [citizenReports.neighborhoodId],
    references: [neighborhoods.id],
  }),
  handledBy: one(staff, {
    fields: [citizenReports.handledByStaffId],
    references: [staff.id],
  }),
}));

/* ==========================================================================
   INFERRED TYPES
   ========================================================================== */

export type Village = typeof villages.$inferSelect;
export type Hamlet = typeof hamlets.$inferSelect;
export type Neighborhood = typeof neighborhoods.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type StaffShift = typeof staffShifts.$inferSelect;
export type Family = typeof families.$inferSelect;
export type Resident = typeof residents.$inferSelect;
export type ResidentMutation = typeof residentMutations.$inferSelect;
export type LetterType = typeof letterTypes.$inferSelect;
export type LetterRequirement = typeof letterRequirements.$inferSelect;
export type LetterRequest = typeof letterRequests.$inferSelect;
export type NewLetterRequest = typeof letterRequests.$inferInsert;
export type LetterAttachment = typeof letterAttachments.$inferSelect;
export type SignatureRequest = typeof signatureRequests.$inferSelect;
export type CitizenReport = typeof citizenReports.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type DailyStat = typeof dailyStats.$inferSelect;

export type RequestStatus = (typeof requestStatusEnum.enumValues)[number];
export type LetterAttachmentStatus = (typeof attachmentStatusEnum.enumValues)[number];
export type ActivityKind = (typeof activityKindEnum.enumValues)[number];
export type StaffRole = (typeof staffRoleEnum.enumValues)[number];

/** Recursive `created_at` trigger helper reused by the migration script. */
export const touchUpdatedAt = sql`updated_at = now()`;
