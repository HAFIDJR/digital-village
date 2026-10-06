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

export const residentStatusSchema = z.enum([
  "AKTIF",
  "PINDAH_KELUAR",
  "MENINGGAL",
  "TIDAK_DIKENAL",
]);

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

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    /** Field-level issues keyed by dotted path, ready for form binding. */
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/* -------------------------------------------------------------------------- */
/* Authentication                                                              */
/* -------------------------------------------------------------------------- */

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
  /** Required when rotating an already-activated certificate. */
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
