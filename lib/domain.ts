/**
 * Domain vocabulary.
 *
 * Every enum coming out of PostgreSQL is mapped here to a Bahasa Indonesia
 * label, a semantic tone, and the exact Tailwind classes the badge renders.
 * Centralising it guarantees that "MENUNGGU_TTD_KADES" is never spelled three
 * different ways in three different components.
 */
import type {
  ActivityKind,
  LetterAttachmentStatus,
  RequestStatus,
  StaffRole,
} from "@/db/schema";

/** The four semantic buckets from the design brief, plus a neutral. */
export type Tone = "pending" | "approved" | "rejected" | "progress" | "neutral";

export const TONE_CLASSES: Record<
  Tone,
  { chip: string; dot: string; text: string; bar: string; softBorder: string }
> = {
  pending: {
    chip: "border-pending-line/70 bg-pending-bg text-pending",
    dot: "bg-pending-solid",
    text: "text-pending",
    bar: "bg-pending-solid",
    softBorder: "border-pending-line/60",
  },
  approved: {
    chip: "border-approved-line/70 bg-approved-bg text-approved",
    dot: "bg-approved-solid",
    text: "text-approved",
    bar: "bg-approved-solid",
    softBorder: "border-approved-line/60",
  },
  rejected: {
    chip: "border-rejected-line/70 bg-rejected-bg text-rejected",
    dot: "bg-rejected-solid",
    text: "text-rejected",
    bar: "bg-rejected-solid",
    softBorder: "border-rejected-line/60",
  },
  progress: {
    chip: "border-progress-line/70 bg-progress-bg text-progress",
    dot: "bg-progress-solid",
    text: "text-progress",
    bar: "bg-progress-solid",
    softBorder: "border-progress-line/60",
  },
  neutral: {
    chip: "border-neutral-line/80 bg-neutral-bg text-neutral",
    dot: "bg-slate-500",
    text: "text-neutral",
    bar: "bg-slate-500",
    softBorder: "border-neutral-line/60",
  },
};

/* -------------------------------------------------------------------------- */
/* Letter request lifecycle                                                    */
/* -------------------------------------------------------------------------- */

export const REQUEST_STATUS: Record<
  RequestStatus,
  { label: string; short: string; tone: Tone; description: string }
> = {
  PENDING_VERIFIKASI: {
    label: "Pending Verifikasi",
    short: "Verifikasi",
    tone: "pending",
    description: "Berkas baru masuk dan belum diperiksa petugas loket.",
  },
  BERKAS_TIDAK_LENGKAP: {
    label: "Berkas Tidak Lengkap",
    short: "Berkas Kurang",
    tone: "rejected",
    description: "Terdapat berkas yang tidak memenuhi syarat dan perlu diunggah ulang.",
  },
  DIVERIFIKASI: {
    label: "Diverifikasi",
    short: "Diverifikasi",
    tone: "progress",
    description: "Berkas lengkap dan siap diteruskan ke agenda tanda tangan.",
  },
  MENUNGGU_TTD_KADES: {
    label: "Menunggu TTD Kades",
    short: "Tunggu TTD",
    tone: "pending",
    description: "Menunggu tanda tangan elektronik Kepala Desa.",
  },
  DITANDATANGANI: {
    label: "Ditandatangani",
    short: "TTD Selesai",
    tone: "approved",
    description: "Sudah ditandatangani secara elektronik, siap dicetak.",
  },
  SIAP_DIAMBIL: {
    label: "Siap Diambil",
    short: "Siap Ambil",
    tone: "approved",
    description: "Surat tercetak dan menunggu diambil pemohon di loket.",
  },
  SELESAI: {
    label: "Selesai",
    short: "Selesai",
    tone: "approved",
    description: "Surat telah diserahkan dan diarsipkan.",
  },
  DITOLAK: {
    label: "Ditolak",
    short: "Ditolak",
    tone: "rejected",
    description: "Pengajuan ditolak permanen dengan alasan tertulis.",
  },
};

/** Statuses that still need an officer's attention. */
export const OPEN_STATUSES: RequestStatus[] = [
  "PENDING_VERIFIKASI",
  "BERKAS_TIDAK_LENGKAP",
  "DIVERIFIKASI",
  "MENUNGGU_TTD_KADES",
];

/** Rows the dashboard counts as "belum diproses". */
export const UNPROCESSED_STATUSES: RequestStatus[] = [
  "PENDING_VERIFIKASI",
  "BERKAS_TIDAK_LENGKAP",
];

export const ALL_REQUEST_STATUSES = Object.keys(REQUEST_STATUS) as RequestStatus[];

/* -------------------------------------------------------------------------- */
/* Attachments                                                                 */
/* -------------------------------------------------------------------------- */

export const ATTACHMENT_STATUS: Record<
  LetterAttachmentStatus,
  { label: string; tone: Tone; hint: string }
> = {
  LENGKAP: {
    label: "Lengkap",
    tone: "approved",
    hint: "Berkas terbaca jelas dan memenuhi syarat.",
  },
  BURAM: {
    label: "Buram",
    tone: "pending",
    hint: "Hasil pindai kurang tajam; tetap terbaca namun tidak memenuhi standar arsip.",
  },
  TIDAK_ADA: { label: "Tidak Ada", tone: "rejected", hint: "Belum diunggah oleh pemohon." },
  TIDAK_RELEVAN: {
    label: "Tidak Relevan",
    tone: "neutral",
    hint: "Berkas tidak sesuai dengan persyaratan surat ini.",
  },
};

/* -------------------------------------------------------------------------- */
/* Activity feed                                                               */
/* -------------------------------------------------------------------------- */

export const ACTIVITY_KIND: Record<ActivityKind, { label: string; tone: Tone }> = {
  PENGAJUAN_BARU: { label: "Pengajuan Baru", tone: "progress" },
  VERIFIKASI_BERKAS: { label: "Verifikasi Berkas", tone: "progress" },
  PENOLAKAN: { label: "Penolakan", tone: "rejected" },
  PERSETUJUAN: { label: "Persetujuan", tone: "approved" },
  TANDA_TANGAN: { label: "Tanda Tangan", tone: "approved" },
  CETAK_SURAT: { label: "Cetak Surat", tone: "neutral" },
  MUTASI_PENDUDUK: { label: "Mutasi Penduduk", tone: "neutral" },
  PENGUMUMAN: { label: "Pengumuman", tone: "progress" },
  MASUK_LOG: { label: "Log Sistem", tone: "neutral" },
};

/* -------------------------------------------------------------------------- */
/* Staff                                                                       */
/* -------------------------------------------------------------------------- */

export const STAFF_ROLE: Record<StaffRole, string> = {
  OPERATOR_DESA: "Operator Desa",
  SEKDES: "Sekretaris Desa",
  KASI_PELAYANAN: "Kasi Pelayanan",
  KAUR_TU: "Kaur Tata Usaha",
  KADES: "Kepala Desa",
  KADUS: "Kepala Dusun",
};

/** Permission matrix — declared once, consumed by the UI to gate actions. */
export const ROLE_CAPABILITIES: Record<
  StaffRole,
  { verify: boolean; sign: boolean; publish: boolean; manageRegistry: boolean }
> = {
  // Front-office roles broadcast operational notices (jam layanan, pemadaman
  // listrik, jadwal posyandu) as part of their daily desk, so both carry the
  // publish capability; the Kepala Desa's e-signature remains their only gate.
  OPERATOR_DESA: { verify: true, sign: false, publish: true, manageRegistry: true },
  SEKDES: { verify: true, sign: false, publish: true, manageRegistry: true },
  KASI_PELAYANAN: { verify: true, sign: false, publish: true, manageRegistry: true },
  KAUR_TU: { verify: true, sign: false, publish: true, manageRegistry: true },
  KADES: { verify: false, sign: true, publish: true, manageRegistry: false },
  KADUS: { verify: false, sign: false, publish: false, manageRegistry: false },
};

/* -------------------------------------------------------------------------- */
/* Citizen reports                                                             */
/* -------------------------------------------------------------------------- */

export const REPORT_STATUS: Record<string, { label: string; tone: Tone }> = {
  NEW: { label: "Baru", tone: "pending" },
  IN_PROGRESS: { label: "Sedang Dikerjakan", tone: "progress" },
  RESOLVED: { label: "Selesai", tone: "approved" },
  REJECTED: { label: "Ditolak", tone: "rejected" },
};

export const REPORT_CATEGORY: Record<string, string> = {
  INFRASTRUKTUR: "Infrastruktur",
  KEBERSIHAN: "Kebersihan",
  KEAMANAN: "Keamanan",
  AIR_BERSIH: "Air Bersih",
  LAYANAN_PUBLIK: "Layanan Publik",
  LAINNYA: "Lainnya",
};

/* -------------------------------------------------------------------------- */
/* Announcements                                                               */
/* -------------------------------------------------------------------------- */

export const ANNOUNCEMENT_CHANNEL: Record<string, { label: string; description: string }> = {
  WEBSITE_DESA: {
    label: "Website Desa",
    description: "Tampil pada halaman beranda sukamaju.desa.id",
  },
  PAPAN_INFORMASI: {
    label: "Papan Informasi",
    description: "Dicetak dan ditempel di papan informasi balai desa",
  },
  PENGUMUMAN_WA: {
    label: "Grup WhatsApp Warga",
    description: "Diteruskan ke grup koordinasi RT/RW",
  },
};

export const ANNOUNCEMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAF: { label: "Draf", tone: "neutral" },
  TERJADWAL: { label: "Terjadwal", tone: "pending" },
  TERBIT: { label: "Terbit", tone: "approved" },
  DIARSIPKAN: { label: "Diarsipkan", tone: "neutral" },
};

export const PRIORITY: Record<string, { label: string; tone: Tone; className: string }> = {
  NORMAL: { label: "Normal", tone: "neutral", className: "text-fg-subtle" },
  PRIORITAS: { label: "Prioritas", tone: "pending", className: "text-pending" },
  DARURAT: { label: "Darurat", tone: "rejected", className: "text-rejected" },
};

export const NOTIFICATION_SEVERITY: Record<
  string,
  { label: string; tone: Tone }
> = {
  INFO: { label: "Informasi", tone: "progress" },
  SUCCESS: { label: "Berhasil", tone: "approved" },
  WARNING: { label: "Perhatian", tone: "pending" },
  CRITICAL: { label: "Kritis", tone: "rejected" },
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

export const REQUEST_CHANNEL: Record<string, string> = {
  WEBSITE: "Website Desa",
  LOKET: "Loket Pelayanan",
  WHATSAPP: "WhatsApp Warga",
};

export const MUTATION_KIND: Record<string, string> = {
  KELAHIRAN: "Kelahiran",
  KEMATIAN: "Kematian",
  PINDAH_DATANG: "Pindah Datang",
  PINDAH_KELUAR: "Pindah Keluar",
  PERBAIKAN_DATA: "Perbaikan Data",
};

export const DOCUMENT_LABEL: Record<string, string> = {
  KTP: "KTP",
  KK: "Kartu Keluarga",
  PENGANTAR_RT: "Pengantar RT/RW",
  AKTA_KELAHIRAN: "Akta Kelahiran",
  KETERANGAN_MEDIS: "Keterangan Medis",
  FOTO_USAHA: "Foto Usaha",
  FOTO_RUMAH: "Foto Rumah",
  SURAT_RT: "Keterangan RT/RW",
  PROPOSAL: "Proposal Kegiatan",
  SLIP_GAJI: "Slip / Ket. Penghasilan",
  SERTIFIKAT_TANAH: "Bukti Kepemilikan Tanah",
  BUKTI_PBB: "Bukti PBB",
  DOKUMEN_SILANG: "Dokumen Pembanding",
};

/**
 * Maps a backend enum value to a stable CSS class string. Kept as a function
 * (rather than a lookup at every call site) so an unknown value degrades to
 * neutral instead of crashing the table row.
 */
export function toneClass(tone: Tone | undefined) {
  return TONE_CLASSES[tone ?? "neutral"];
}
