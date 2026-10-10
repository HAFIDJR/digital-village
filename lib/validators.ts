import { z } from "zod";

export const nikSchema = z
  .string()
  .trim()
  .regex(/^\d{16}$/, "NIK harus 16 digit angka");

export const kkSchema = z
  .string()
  .trim()
  .regex(/^\d{16}$/, "Nomor KK harus 16 digit angka");

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+62|62|0)8[1-9][0-9]{6,11}$/, "Format nomor HP tidak valid");

export const uuidSchema = z.string().uuid("ID tidak valid");

export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus berformat YYYY-MM-DD");

/** Ticket reference as printed on a letter: "SRT-1049". */
export const ticketSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}-\d{3,6}$/, "Format nomor berkas tidak valid");

export const searchTermSchema = z
  .string()
  .trim()
  .max(80, "Kata kunci maksimal 80 karakter")
  .transform((value) => value.replace(/\s+/g, " "));

export const requestStatusSchema = z.enum([
  "PENDING_VERIFIKASI",
  "BERKAS_TIDAK_LENGKAP",
  "DIVERIFIKASI",
  "MENUNGGU_TTD_KADES",
  "DITANDATANGANI",
  "SIAP_DIAMBIL",
  "SELESAI",
  "DITOLAK",
]);

export const prioritySchema = z.enum(["NORMAL", "PRIORITAS", "DARURAT"], {
  error: "Prioritas harus Normal, Prioritas, atau Darurat",
});

export const attachmentStatusSchema = z.enum([
  "LENGKAP",
  "BURAM",
  "TIDAK_ADA",
  "TIDAK_RELEVAN",
]);

export const announcementChannelSchema = z.enum(
  ["WEBSITE_DESA", "PAPAN_INFORMASI", "PENGUMUMAN_WA"],
  {
    error:
      "Kanal harus Website Desa, Papan Informasi, atau Pengumuman WhatsApp",
  },
);

export const announcementStatusSchema = z.enum([
  "DRAF",
  "TERJADWAL",
  "TERBIT",
  "DIARSIPKAN",
]);

export const reportStatusSchema = z.enum(
  ["NEW", "IN_PROGRESS", "RESOLVED", "REJECTED"],
  {
    error: "Status laporan tidak dikenal",
  },
);

export const reportCategorySchema = z.enum(
  [
    "INFRASTRUKTUR",
    "KEBERSIHAN",
    "KEAMANAN",
    "AIR_BERSIH",
    "LAYANAN_PUBLIK",
    "LAINNYA",
  ],
  { error: "Kategori laporan tidak dikenal" },
);

export const reportSortSchema = z.enum([
  "newest",
  "oldest",
  "priority_desc",
  "unanswered_first",
]);

export const registrySortSchema = z.enum([
  "name_asc",
  "name_desc",
  "newest",
  "dusun_asc",
]);

export const residentStatusSchema = z.enum(
  ["AKTIF", "PINDAH_KELUAR", "MENINGGAL", "TIDAK_DIKENAL"],
  { error: "Status penduduk tidak dikenal" },
);

export const genderSchema = z.enum(["L", "P"], {
  error: "Jenis kelamin harus L (laki-laki) atau P (perempuan)",
});

export const religionSchema = z.enum(
  ["ISLAM", "KRISTEN", "KATOLIK", "HINDU", "BUDDHA", "KONGHUCU", "LAINNYA"],
  { error: "Agama tidak dikenal" },
);

export const maritalStatusSchema = z.enum(
  ["BELUM_MENIKAH", "KAWIN", "CERAI_HIDUP", "CERAI_MATI"],
  { error: "Status perkawinan tidak dikenal" },
);

export const queueSortSchema = z.enum([
  "submitted_desc",
  "submitted_asc",
  "sla_asc",
  "priority_desc",
]);

export const PAGE_SIZES = [10, 25, 50, 100] as const;

export const pageSchema = z.coerce
  .number({ error: "Nomor halaman harus berupa angka" })
  .int("Nomor halaman harus bilangan bulat")
  .min(1, "Nomor halaman minimal 1")
  .max(10_000, "Nomor halaman terlalu besar")
  .default(1);

export const pageSizeSchema = z.coerce
  .number({ error: "Ukuran halaman harus berupa angka" })
  .int("Ukuran halaman harus bilangan bulat")
  .refine((value) => (PAGE_SIZES as readonly number[]).includes(value), {
    message: `Ukuran halaman harus salah satu dari ${PAGE_SIZES.join(", ")}`,
  })
  .default(10);

function toList(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parts = (Array.isArray(value) ? value : String(value).split(","))
    .map((part) => String(part).trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

export const queueQuerySchema = z.object({
  q: searchTermSchema.optional(),
  status: z.array(requestStatusSchema).max(8).optional(),
  letterType: z.array(z.string().trim().min(1).max(12)).max(12).optional(),
  dusun: z.array(z.string().trim().min(1).max(16)).max(8).optional(),
  channel: z.array(z.string().trim().min(1).max(24)).max(4).optional(),
  sla: z.enum(["all", "overdue", "today"]).default("all"),
  sort: queueSortSchema.default("submitted_desc"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export type QueueQuery = z.infer<typeof queueQuerySchema>;

export function parseQueueQuery(
  input: URLSearchParams | Record<string, unknown>,
): QueueQuery {
  const raw =
    input instanceof URLSearchParams ? Object.fromEntries(input) : input;

  return queueQuerySchema.parse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    status: toList(raw.status),
    letterType: toList(raw.letterType),
    dusun: toList(raw.dusun),
    channel: toList(raw.channel),
    sla: raw.sla ?? "all",
    sort: raw.sort ?? "submitted_desc",
    page: raw.page ?? 1,
    pageSize: raw.pageSize ?? 10,
  });
}

export const reportQuerySchema = z.object({
  q: searchTermSchema.optional(),
  status: z.array(reportStatusSchema).max(4).optional(),
  category: z.array(reportCategorySchema).max(6).optional(),
  dusun: z.array(z.string().trim().min(1).max(16)).max(8).optional(),
  /** "unanswered" surfaces the reports nobody has picked up yet. */
  response: z.enum(["all", "unanswered", "answered"]).default("all"),
  sort: reportSortSchema.default("newest"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;

export function parseReportQuery(
  input: URLSearchParams | Record<string, unknown>,
): ReportQuery {
  const raw =
    input instanceof URLSearchParams ? Object.fromEntries(input) : input;

  return reportQuerySchema.parse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    status: toList(raw.status),
    category: toList(raw.category),
    dusun: toList(raw.dusun),
    response: raw.response ?? "all",
    sort: raw.sort ?? "newest",
    page: raw.page ?? 1,
    pageSize: raw.pageSize ?? 10,
  });
}

/** Laporan / aspirasi yang dikirim warga melalui portal atau loket pelayanan. */
export const reportDraftSchema = z.object({
  category: reportCategorySchema,
  subject: z
    .string({ error: "Judul laporan wajib diisi" })
    .trim()
    .min(8, "Judul laporan minimal 8 karakter")
    .max(200, "Judul laporan maksimal 200 karakter"),
  body: z
    .string({ error: "Isi laporan wajib diisi" })
    .trim()
    .min(20, "Ceritakan kejadian minimal 20 karakter agar petugas dapat menindaklanjuti")
    .max(2000, "Isi laporan maksimal 2.000 karakter"),
  /** RT/RW tempat kejadian; kosong berarti mengikuti alamat pelapor. */
  neighborhoodId: uuidSchema.optional(),
  priority: prioritySchema.default("NORMAL"),
  /**
   * Only honoured when an officer files the report at the counter on somebody's
   * behalf — portal submissions always use the signed-in resident's own data.
   */
  reporter: z
    .object({
      name: z
        .string({ error: "Nama pelapor wajib diisi" })
        .trim()
        .min(3, "Nama pelapor minimal 3 karakter")
        .max(120, "Nama pelapor maksimal 120 karakter"),
      nik: nikSchema.optional(),
      phone: phoneSchema.optional(),
    })
    .optional(),
});

export type ReportDraft = z.infer<typeof reportDraftSchema>;

/** Tindak lanjut operator atas sebuah laporan warga. */
export const reportAdvanceSchema = z.object({
  status: z.enum(["IN_PROGRESS", "RESOLVED", "REJECTED"], {
    error: "Status tindak lanjut tidak dikenal",
  }),
  note: z
    .string()
    .trim()
    .max(500, "Catatan tindak lanjut maksimal 500 karakter")
    .optional(),
});

export type ReportAdvance = z.infer<typeof reportAdvanceSchema>;

export const registryQuerySchema = z.object({
  type: z.enum(["residents", "families"]).default("residents"),
  q: searchTermSchema.optional(),
  status: z.array(residentStatusSchema).max(6).optional(),
  dusun: z.array(z.string().trim().min(1).max(16)).max(8).optional(),
  sort: registrySortSchema.default("name_asc"),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export type RegistryQuery = z.infer<typeof registryQuerySchema>;

export function parseRegistryQuery(
  input: URLSearchParams | Record<string, unknown>,
): RegistryQuery {
  const raw =
    input instanceof URLSearchParams ? Object.fromEntries(input) : input;

  return registryQuerySchema.parse({
    type: raw.type ?? "residents",
    q: typeof raw.q === "string" ? raw.q : undefined,
    status: toList(raw.status),
    dusun: toList(raw.dusun),
    sort: raw.sort ?? "name_asc",
    page: raw.page ?? 1,
    pageSize: raw.pageSize ?? 25,
  });
}

/* -------------------------------------------------------------------------- */
/* Registration drafts (route: /penduduk, /keluarga — capability manageRegistry) */
/* -------------------------------------------------------------------------- */

const fullNameSchema = z
  .string({ error: "Nama lengkap wajib diisi" })
  .trim()
  .min(3, "Nama lengkap minimal 3 karakter")
  .max(120, "Nama lengkap maksimal 120 karakter")
  .transform((value) => value.replace(/\s+/g, " "));

const addressSchema = z
  .string({ error: "Alamat wajib diisi" })
  .trim()
  .min(8, "Alamat minimal 8 karakter")
  .max(400, "Alamat maksimal 400 karakter");

/** Birth date must be a real calendar date in the past and not absurdly old. */
const birthDateSchema = z
  .string({ error: "Tanggal lahir wajib diisi" })
  .pipe(isoDateSchema)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Tanggal lahir tidak valid")
  .refine((value) => Date.parse(value) <= Date.now(), "Tanggal lahir tidak boleh di masa depan")
  .refine(
    (value) => Date.parse(value) >= Date.parse("1900-01-01"),
    "Tanggal lahir di luar rentang pencatatan desa",
  );

export const residentDraftSchema = z.object({
  nik: nikSchema,
  fullName: fullNameSchema,
  gender: genderSchema,
  birthPlace: z
    .string({ error: "Tempat lahir wajib diisi" })
    .trim()
    .min(3, "Tempat lahir minimal 3 karakter")
    .max(80, "Tempat lahir maksimal 80 karakter"),
  birthDate: birthDateSchema,
  religion: religionSchema.default("ISLAM"),
  maritalStatus: maritalStatusSchema.default("BELUM_MENIKAH"),
  education: z.string().trim().max(48, "Pendidikan maksimal 48 karakter").optional(),
  occupation: z.string().trim().max(80, "Pekerjaan maksimal 80 karakter").optional(),
  nationality: z
    .string({ error: "Kewarganegaraan wajib diisi" })
    .trim()
    .min(2, "Kewarganegaraan minimal 2 karakter")
    .max(48, "Kewarganegaraan maksimal 48 karakter")
    .default("WNI"),
  familyRelation: z
    .string({ error: "Hubungan dalam keluarga wajib diisi" })
    .trim()
    .min(3, "Hubungan dalam keluarga minimal 3 karakter")
    .max(48, "Hubungan dalam keluarga maksimal 48 karakter"),
  neighborhoodId: uuidSchema,
  familyId: uuidSchema.optional(),
  address: addressSchema,
  phone: phoneSchema.optional(),
  status: residentStatusSchema.default("AKTIF"),
  documentsVerified: z.boolean().default(false),
});

export type ResidentDraft = z.infer<typeof residentDraftSchema>;

/**
 * Edit / population mutation. Every field is optional so an officer can
 * correct a single attribute; a `status` change is recorded as an append-only
 * row in `resident_mutations`.
 */
export const residentUpdateSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    birthPlace: z.string().trim().min(3).max(80).optional(),
    birthDate: birthDateSchema.optional(),
    religion: religionSchema.optional(),
    maritalStatus: maritalStatusSchema.optional(),
    education: z.string().trim().max(48).optional(),
    occupation: z.string().trim().max(80).optional(),
    nationality: z.string().trim().min(2).max(48).optional(),
    familyRelation: z.string().trim().min(3).max(48).optional(),
    neighborhoodId: uuidSchema.optional(),
    familyId: uuidSchema.nullable().optional(),
    address: addressSchema.optional(),
    phone: phoneSchema.nullable().optional(),
    status: residentStatusSchema.optional(),
    documentsVerified: z.boolean().optional(),
    /** Required whenever `status` changes: the civil event it records. */
    mutationKind: z
      .enum(
        ["KELAHIRAN", "KEMATIAN", "PINDAH_DATANG", "PINDAH_KELUAR", "PERBAIKAN_DATA"],
        { error: "Jenis mutasi penduduk tidak dikenal" },
      )
      .optional(),
    mutationNote: z.string().trim().max(300).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Tidak ada data yang diubah",
    path: ["_form"],
  });

export type ResidentUpdate = z.infer<typeof residentUpdateSchema>;

export const familyDraftSchema = z.object({
  kkNumber: kkSchema,
  headName: fullNameSchema,
  neighborhoodId: uuidSchema,
  address: addressSchema,
  welfareClass: z
    .string({ error: "Klasifikasi kesejahteraan wajib dipilih" })
    .trim()
    .min(3, "Klasifikasi kesejahteraan minimal 3 karakter")
    .max(32, "Klasifikasi kesejahteraan maksimal 32 karakter"),
  /** Residents moved into the new Kartu Keluarga in the same transaction. */
  memberIds: z.array(uuidSchema).max(20).default([]),
});

export type FamilyDraft = z.infer<typeof familyDraftSchema>;

export const residentAccountDraftSchema = z.object({
  residentId: uuidSchema,
  password: z
    .string({ error: "Kata sandi awal wajib diisi" })
    .min(8, "Kata sandi minimal 8 karakter")
    .max(128, "Kata sandi maksimal 128 karakter"),
});

export type ResidentAccountDraft = z.infer<typeof residentAccountDraftSchema>;

export const globalSearchSchema = z.object({
  q: z
    .string({ error: "Kata kunci pencarian wajib diisi" })
    .trim()
    .min(2, "Masukkan minimal 2 karakter")
    .max(80, "Kata kunci maksimal 80 karakter")
    .transform((value) => value.replace(/\s+/g, " ")),
  limit: z.coerce
    .number({ error: "Batas hasil harus berupa angka" })
    .int("Batas hasil harus bilangan bulat")
    .min(1, "Batas hasil minimal 1")
    .max(25, "Batas hasil maksimal 25")
    .default(8),
});

export type GlobalSearchQuery = z.infer<typeof globalSearchSchema>;

export const verifyAttachmentSchema = z.object({
  attachmentId: uuidSchema,
  status: attachmentStatusSchema,
  defectNote: z.string().trim().max(160).optional(),
});

export const verifyRequestSchema = z.object({
  action: z.enum(["setujui", "tolak", "minta_perbaikan"], {
    error: "Tindakan harus setujui, tolak, atau minta perbaikan",
  }),
  note: z.string().trim().max(500).optional(),
  attachments: z.array(verifyAttachmentSchema).max(20).optional(),
  expedite: z.boolean().default(false),
});

export type VerifyRequestInput = z.infer<typeof verifyRequestSchema>;

export const signRequestSchema = z.object({
  passphrase: z
    .string()
    .min(8, "Frasa sandi minimal 8 karakter")
    .max(128, "Frasa sandi maksimal 128 karakter"),
  certificateSerial: z.string().trim().max(64).optional(),
});

export type SignRequestInput = z.infer<typeof signRequestSchema>;

export const printRequestSchema = z.object({
  /** "draft" watermarks the PDF; "final" surrenders it to the applicant. */
  mode: z
    .enum(["draft", "final"], { error: "Mode cetak harus draf atau final" })
    .default("draft"),
  copies: z.coerce
    .number({ error: "Jumlah lembar harus berupa angka" })
    .int("Jumlah lembar harus bilangan bulat")
    .min(1, "Jumlah lembar minimal 1")
    .max(5, "Jumlah lembar maksimal 5")
    .default(1),
});

export type PrintRequestInput = z.infer<typeof printRequestSchema>;

export const markCollectedSchema = z.object({
  collectedBy: z
    .string()
    .trim()
    .min(3, "Nama pengambil minimal 3 karakter")
    .max(120),
  note: z.string().trim().max(300).optional(),
});

export type MarkCollectedInput = z.infer<typeof markCollectedSchema>;

/* -------------------------------------------------------------------------- */
/* Online letter submission (portal warga → antrean loket)                     */
/* -------------------------------------------------------------------------- */

/** Scan uploads are accepted as JPEG, PNG, or PDF and capped at 5 MB each. */
export const ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/**
 * One uploaded file, described by the server from the multipart body itself —
 * the client never sends a `storageKey` or a URL.
 */
export const letterAttachmentManifestSchema = z.object({
  docKey: z
    .string({ error: "Jenis berkas wajib dipilih" })
    .trim()
    .min(1, "Jenis berkas wajib dipilih")
    .max(40, "Jenis berkas tidak dikenal"),
  fileName: z
    .string({ error: "Nama berkas wajib diisi" })
    .trim()
    .min(1, "Nama berkas wajib diisi")
    .max(200, "Nama berkas maksimal 200 karakter"),
  mimeType: z
    .string({ error: "Tipe berkas wajib diisi" })
    .trim()
    .refine(
      (value) => (ATTACHMENT_MIME_TYPES as readonly string[]).includes(value),
      "Berkas harus berformat JPG, PNG, atau PDF",
    ),
  sizeBytes: z
    .number({ error: "Ukuran berkas tidak valid" })
    .int("Ukuran berkas tidak valid")
    .positive("Berkas tidak boleh kosong")
    .max(MAX_ATTACHMENT_BYTES, "Ukuran berkas maksimal 5 MB"),
});

export type LetterAttachmentManifest = z.infer<
  typeof letterAttachmentManifestSchema
>;

export const letterRequestDraftSchema = z.object({
  letterTypeId: uuidSchema,
  purpose: z
    .string({ error: "Keperluan surat wajib diisi" })
    .trim()
    .min(10, "Jelaskan keperluan surat minimal 10 karakter")
    .max(500, "Keperluan surat maksimal 500 karakter"),
  /** Free-form answers to the letter template's variables. */
  payload: z
    .record(z.string(), z.union([z.string(), z.number(), z.null()]))
    .default({}),
  channel: z.enum(["WEBSITE", "LOKET", "WHATSAPP"]).default("WEBSITE"),
  attachments: z.array(letterAttachmentManifestSchema).max(12).default([]),
});

export type LetterRequestDraft = z.infer<typeof letterRequestDraftSchema>;

export const announcementDraftSchema = z.object({
  title: z
    .string({ error: "Judul pengumuman wajib diisi" })
    .trim()
    .min(8, "Judul minimal 8 karakter")
    .max(200, "Judul maksimal 200 karakter"),
  body: z
    .string({ error: "Isi pengumuman wajib diisi" })
    .trim()
    .min(20, "Isi pengumuman minimal 20 karakter")
    .max(4000, "Isi pengumuman maksimal 4.000 karakter"),
  channel: announcementChannelSchema.default("WEBSITE_DESA"),
  status: announcementStatusSchema.default("TERBIT"),
  priority: prioritySchema.default("NORMAL"),
  pinned: z.boolean().default(false),
  audience: z
    .string({ error: "Sasaran pembaca wajib diisi" })
    .trim()
    .min(3, "Sasaran pembaca minimal 3 karakter")
    .max(80, "Sasaran pembaca maksimal 80 karakter")
    .default("Seluruh Warga"),
  publishAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
});

export type AnnouncementDraft = z.infer<typeof announcementDraftSchema>;

/** Marks portal announcements as read; kosong berarti tandai semua. */
export const residentAnnouncementReadSchema = z.object({
  ids: z.array(uuidSchema).max(50).optional(),
});

export type ResidentAnnouncementReadInput = z.infer<
  typeof residentAnnouncementReadSchema
>;

/** `since` lets the portal poll only for broadcasts published after it last looked. */
export const residentAnnouncementQuerySchema = z.object({
  since: z.coerce
    .date({ error: "Penanda waktu tidak valid" })
    .optional(),
  limit: z.coerce
    .number({ error: "Batas hasil harus berupa angka" })
    .int("Batas hasil harus bilangan bulat")
    .min(1, "Batas hasil minimal 1")
    .max(100, "Batas hasil maksimal 100")
    .default(40),
});

export type ResidentAnnouncementQuery = z.infer<
  typeof residentAnnouncementQuerySchema
>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    /** Field-level issues keyed by dotted path, ready for form binding. */
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

// AUTH
const emailSchema = z
  .string({ error: "Email wajib diisi" })
  .trim()
  .toLowerCase()
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Format email tidak valid")
  .max(160, "Email maksimal 160 karakter");

const passwordSchema = z
  .string({ error: "Kata sandi wajib diisi" })
  .min(8, "Kata sandi minimal 8 karakter")
  .max(128, "Kata sandi maksimal 128 karakter");

const redirectPathSchema = z
  .string()
  .max(200, "Alamat tujuan terlalu panjang")
  .optional();

export const staffLoginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  station: z
    .enum(["Loket Pelayanan", "Verifikasi Berkas", "Ruang Kepala Desa", "Tata Usaha"], {
      error: "Pos layanan tidak dikenal",
    })
    .default("Loket Pelayanan"),
  next: redirectPathSchema,
});

export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

export const residentLoginSchema = z.object({
  nik: nikSchema,
  password: passwordSchema,
  next: redirectPathSchema,
});

export type ResidentLoginInput = z.infer<typeof residentLoginSchema>;

export const esignPassphraseSchema = z.object({
  currentPassphrase: z.string().min(8).max(128).optional(),
  newPassphrase: z
    .string({ error: "Frasa sandi baru wajib diisi" })
    .min(8, "Frasa sandi minimal 8 karakter")
    .max(128, "Frasa sandi maksimal 128 karakter"),
});

export type EsignPassphraseInput = z.infer<typeof esignPassphraseSchema>;

/** Flattens a ZodError into the field map the API returns and forms consume. */
export function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const output: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_form";
    output[key] ??= [];
    output[key].push(issue.message);
  }
  return output;
}
