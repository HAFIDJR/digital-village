import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import {
  BadgeCheck,
  CalendarDays,
  CircleAlert,
  Landmark,
  MapPin,
  QrCode,
  ShieldCheck,
} from "lucide-react";

import { ensureDatabaseReady } from "@/db/bootstrap";
import { getDb } from "@/db/client";
import { REQUEST_STATUS } from "@/lib/domain";
import { formatDate, formatDateTime, formatNik } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verifikasi Keaslian Surat",
  description:
    "Halaman verifikasi publik untuk memastikan keaslian dokumen yang diterbitkan Pemerintah Desa Sukamaju.",
  robots: { index: false, follow: false },
};

type VerificationRow = {
  ticket: string;
  letterName: string;
  letterCode: string;
  status: string;
  applicantName: string;
  applicantNik: string;
  purpose: string;
  submittedAt: string;
  signedAt: string | null;
  completedAt: string | null;
  certificateSerial: string | null;
  signerName: string | null;
  dusun: string;
  rt: number;
  rw: number;
  villageName: string;
  villageDistrict: string;
  villageRegency: string;
  headName: string;
};

/**
 * Public verification landing page.
 *
 * This is the destination of the QR code printed on every letter, so it is
 * intentionally outside the dashboard chrome and readable by anyone holding the
 * document — including an officer at a bank counter on a phone. It deliberately
 * reveals only what is already printed on the letter: no address, no family
 * data, no uploaded documents.
 *
 * Confirming *which* document a code belongs to is the whole security property
 * here: a forged letter cannot carry a code that resolves to a real, signed one.
 */
async function lookup(code: string): Promise<VerificationRow | null> {
  await ensureDatabaseReady();
  const db = await getDb();

  const result = await db.execute<VerificationRow>(sql`
    select lr.ticket,
           lt.name            as "letterName",
           lt.code            as "letterCode",
           lr.status::text    as status,
           lr.applicant_name  as "applicantName",
           lr.applicant_nik   as "applicantNik",
           lr.purpose,
           lr.submitted_at    as "submittedAt",
           sr.signed_at       as "signedAt",
           lr.completed_at    as "completedAt",
           sr.certificate_serial as "certificateSerial",
           signer.full_name   as "signerName",
           split_part(h.name, ' - ', 1) as dusun,
           n.rt,
           n.rw,
           v.name             as "villageName",
           v.district         as "villageDistrict",
           v.regency          as "villageRegency",
           v.head_name        as "headName"
    from letter_requests lr
    join letter_types lt on lt.id = lr.letter_type_id
    join neighborhoods n on n.id = lr.neighborhood_id
    join hamlets h on h.id = n.hamlet_id
    join villages v on v.id = lr.village_id
    left join signature_requests sr on sr.request_id = lr.id and sr.status = 'DITANDATANGANI'
    left join staff signer on signer.id = sr.signer_staff_id
    where lr.verification_code = ${code}
    limit 1
  `);

  return result.rows[0] ?? null;
}

export default async function VerificationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  // Codes are fixed-length base32; anything else cannot exist.
  if (!/^[A-Z2-9]{12}$/.test(code)) notFound();

  const record = await lookup(code);
  const statusMeta = record ? REQUEST_STATUS[record.status as keyof typeof REQUEST_STATUS] : null;
  const isAuthentic = Boolean(record?.signedAt);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-ink">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/seal-desa-sukamaju.svg"
            alt="Lambang Desa Sukamaju"
            width={34}
            height={34}
            className="size-8 rounded-sm border border-white/15 bg-white"
          />
          <div className="min-w-0">
            <p className="truncate font-display text-[13px] font-bold text-white">
              Pemerintah {record?.villageName ?? "Desa Sukamaju"}
            </p>
            <p className="truncate text-2xs text-white/60">
              {record
                ? `${record.villageDistrict} · ${record.villageRegency}`
                : "Kabupaten Bandung · Jawa Barat"}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-7">
        {!record ? (
          <NotFoundPanel code={code} />
        ) : (
          <div className="space-y-4">
            {/* --------------------------------------------------- verdict */}
            <section
              className={cn(
                "panel overflow-hidden",
                isAuthentic ? "border-approved-line" : "border-pending-line",
              )}
            >
              <div
                className={cn(
                  "flex items-center gap-3 border-b px-4 py-3.5",
                  isAuthentic
                    ? "border-approved-line/50 bg-approved-bg"
                    : "border-pending-line/50 bg-pending-bg",
                )}
              >
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full",
                    isAuthentic ? "bg-approved-solid text-white" : "bg-pending-solid text-white",
                  )}
                  aria-hidden
                >
                  {isAuthentic ? <BadgeCheck className="size-5" /> : <CircleAlert className="size-5" />}
                </span>
                <div className="min-w-0">
                  <h1
                    className={cn(
                      "font-display text-sm font-bold",
                      isAuthentic ? "text-approved" : "text-pending",
                    )}
                  >
                    {isAuthentic
                      ? "Dokumen Asli dan Sah"
                      : "Dokumen Terdaftar — Belum Ditandatangani"}
                  </h1>
                  <p
                    className={cn(
                      "mt-0.5 text-2xs leading-4",
                      isAuthentic ? "text-approved/90" : "text-pending/90",
                    )}
                  >
                    {isAuthentic
                      ? "Kode ini cocok dengan dokumen yang ditandatangani secara elektronik oleh Kepala Desa."
                      : "Kode ini terdaftar pada sistem desa, namun dokumennya belum memperoleh tanda tangan elektronik. Dokumen semacam ini belum sah untuk dipergunakan."}
                  </p>
                </div>
              </div>

              <dl className="divide-y divide-line">
                <Row label="Nomor Surat" value={record.ticket} mono />
                <Row label="Jenis Surat" value={record.letterName} badge={record.letterCode} />
                <Row label="Atas Nama" value={record.applicantName} />
                <Row label="NIK" value={formatNik(record.applicantNik)} mono />
                <Row
                  label="Wilayah"
                  value={`${record.dusun} · RT ${String(record.rt).padStart(2, "0")}/RW ${String(record.rw).padStart(2, "0")}`}
                />
                <Row label="Maksud Pengajuan" value={record.purpose} />
                <Row label="Tanggal Diajukan" value={formatDateTime(record.submittedAt)} />
                <Row
                  label="Ditandatangani"
                  value={record.signedAt ? formatDateTime(record.signedAt) : "Belum ditandatangani"}
                />
                <Row
                  label="Pejabat Penanda Tangan"
                  value={record.signerName ?? record.headName}
                />
                {record.certificateSerial ? (
                  <Row label="Sertifikat BSrE" value={record.certificateSerial} mono />
                ) : null}
                <Row label="Status Berkas" value={statusMeta?.label ?? record.status} />
                <Row label="Kode Verifikasi" value={code} mono />
              </dl>
            </section>

            {/* --------------------------------------------------- notes */}
            <section className="panel p-4">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <ShieldCheck className="size-3.5 text-approved" aria-hidden />
                Cara membaca hasil verifikasi
              </h2>
              <ul className="mt-2 space-y-1.5">
                {[
                  "Cocokkan nomor surat di atas dengan nomor yang tercetak pada dokumen fisik.",
                  "Cocokkan nama dan NIK dengan data yang tertera pada surat.",
                  "Halaman ini tidak menampilkan alamat lengkap atau berkas unggahan — data tersebut hanya dapat diakses petugas desa berwenang.",
                  "Bila data tidak cocok atau kode tidak dikenali, hubungi kantor desa untuk konfirmasi.",
                ].map((note) => (
                  <li key={note} className="flex items-start gap-2 text-2xs leading-4 text-fg-muted">
                    <span
                      className="mt-1.5 size-1 shrink-0 rounded-full bg-line-strong"
                      aria-hidden
                    />
                    {note}
                  </li>
                ))}
              </ul>
            </section>

            <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[10px] text-fg-subtle">
              <span className="flex items-center gap-1">
                <Landmark className="size-3" aria-hidden />
                {record.villageName}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="size-3" aria-hidden />
                {record.villageRegency}
              </span>
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3" aria-hidden />
                Diverifikasi {formatDate(new Date())}
              </span>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Row({
  label,
  value,
  mono,
  badge,
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: string;
}) {
  return (
    <div className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-3 px-4 py-2.5">
      <dt className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd
        className={cn(
          "flex items-start gap-2 text-xs leading-5 text-fg",
          mono && "font-mono font-semibold tabular-nums tracking-tight",
        )}
      >
        {badge ? (
          <span className="rounded-xs border border-civic/25 bg-civic-soft px-1.5 py-px font-mono text-[10px] font-bold text-civic">
            {badge}
          </span>
        ) : null}
        <span className="min-w-0">{value}</span>
      </dd>
    </div>
  );
}

function NotFoundPanel({ code }: { code: string }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-3 border-b border-rejected-line/50 bg-rejected-bg px-4 py-3.5">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full bg-rejected-solid text-white"
          aria-hidden
        >
          <CircleAlert className="size-5" />
        </span>
        <div>
          <h1 className="font-display text-sm font-bold text-rejected">
            Kode verifikasi tidak dikenali
          </h1>
          <p className="mt-0.5 text-2xs leading-4 text-rejected/90">
            Tidak ada dokumen desa yang terdaftar dengan kode ini. Kemungkinan dokumen tidak asli
            atau kode salah salin.
          </p>
        </div>
      </div>

      <dl className="divide-y divide-line">
        <Row label="Kode Dibaca" value={code} mono />
        <Row label="Diperiksa Pada" value={formatDateTime(new Date())} />
      </dl>

      <div className="border-t border-line bg-surface-muted px-4 py-3">
        <p className="flex items-start gap-2 text-2xs leading-4 text-fg-muted">
          <QrCode className="mt-px size-3.5 shrink-0 text-fg-subtle" aria-hidden />
          Periksa kembali penulisan kode: panjangnya 12 karakter dan tidak memuat huruf I, O, 0,
          maupun 1. Bila dokumen tetap tidak terverifikasi, laporkan kepada Pemerintah Desa
          Sukamaju untuk penelusuran lebih lanjut.
        </p>
      </div>
    </section>
  );
}

