import type { Metadata } from "next";
import {
  CalendarDays,
  Download,
  FileText,
  IdCard,
  MapPin,
  QrCode,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";

import { getResidentPortalData } from "@/db/queries";
import { requireResidentPage } from "@/lib/auth/guard";
import { REQUEST_STATUS } from "@/lib/domain";
import { formatKk, formatDate, formatNik } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portal Warga",
  description:
    "Pantau status pengajuan surat Anda di Desa Sukamaju dan unduh salinan yang telah ditandatangani.",
  robots: { index: false, follow: false },
};

/**
 * The resident's own desk: household identity and the status of *their*
 * letter requests. New submissions stay a loket service for now — online
 * filing is a deliberate follow-up, not a silent omission.
 */
export default async function WargaPortalPage() {
  const actor = await requireResidentPage();
  const data = await getResidentPortalData(actor.resident.id);
  if (!data) redirect("/warga/masuk");

  const { resident, family, requests } = data;
  const downloadable = requests.filter((r) => r.downloadable).length;
  const inProgress = requests.filter(
    (r) => !["SELESAI", "DITOLAK"].includes(r.status),
  ).length;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">
          Portal Warga
        </p>
        <h1 className="font-display text-lg font-bold tracking-[-0.01em] text-fg">
          Layanan Surat Saya
        </h1>
        <p className="mt-0.5 text-xs leading-4 text-fg-muted">
          Selamat datang, {resident.fullName}. Berikut pengajuan surat Anda yang
          tercatat di kantor desa.
        </p>
      </div>

      {/* ------------------------------------------------------- identity */}
      <section
        aria-labelledby="identitas-warga"
        className="rounded-lg border border-line bg-surface"
      >
        <h2
          id="identitas-warga"
          className="border-b border-line px-4 py-2.5 text-xs font-semibold text-fg"
        >
          Data Terdaftar
        </h2>
        <dl className="grid gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-2">
          <IdentityTerm icon={IdCard} term="NIK" detail={formatNik(resident.nik)} mono />
          <IdentityTerm
            icon={Users}
            term="Kartu Keluarga"
            detail={family ? `${formatKk(family.kkNumber ?? "")} · ${family.headName}` : "—"}
          />
          <IdentityTerm
            icon={MapPin}
            term="Alamat"
            detail={`${resident.address} (RT ${resident.rt}/RW ${resident.rw}, ${resident.dusun})`}
          />
          <IdentityTerm
            icon={CalendarDays}
            term="Pengajuan aktif"
            detail={`${inProgress} sedang diproses · ${downloadable} siap diunduh`}
          />
        </dl>
      </section>

      {/* ------------------------------------------------------- requests */}
      <section aria-labelledby="daftar-pengajuan" className="rounded-lg border border-line bg-surface">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 id="daftar-pengajuan" className="text-xs font-semibold text-fg">
            Pengajuan Surat
          </h2>
          <span className="tnum text-2xs text-fg-subtle">
            {requests.length} total
          </span>
        </div>

        {requests.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="grid size-9 place-items-center rounded-md border border-line bg-surface-muted">
              <FileText className="size-4 text-fg-subtle" aria-hidden />
            </span>
            <p className="text-xs font-medium text-fg">Belum ada pengajuan surat</p>
            <p className="max-w-sm text-2xs leading-4 text-fg-subtle">
              Ajukan surat administrasi langsung di loket pelayanan balai desa
              dengan membawa KTP dan dokumen pendukung. Status pengajuan akan
              muncul di halaman ini.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {requests.map((request) => {
              const status = REQUEST_STATUS[request.status as keyof typeof REQUEST_STATUS];
              return (
                <li key={request.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-fg">
                        {request.letterName}
                      </p>
                      <p className="tnum mt-0.5 font-mono text-2xs text-fg-subtle">
                        {request.ticket} · diajukan {formatDate(request.submittedAt)}
                      </p>
                      {request.purpose ? (
                        <p className="mt-1 max-w-md truncate text-2xs leading-4 text-fg-muted">
                          {request.purpose}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {status ? (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-semibold ${
                            status.tone === "approved"
                              ? "border-approved-line/70 bg-approved-bg text-approved"
                              : status.tone === "rejected"
                                ? "border-rejected-line/70 bg-rejected-bg text-rejected"
                                : status.tone === "progress"
                                  ? "border-progress-line/70 bg-progress-bg text-progress"
                                  : "border-pending-line/70 bg-pending-bg text-pending"
                          }`}
                        >
                          {status.label}
                        </span>
                      ) : null}
                      <span className="flex items-center gap-1.5">
                        {request.downloadable ? (
                          <a
                            href={`/api/warga/requests/${request.id}/pdf`}
                            className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-civic bg-civic px-2.5 text-xs font-medium text-white transition-colors hover:bg-civic-hover"
                            download
                          >
                            <Download className="size-3.5" aria-hidden />
                            Unduh PDF
                          </a>
                        ) : null}
                        {request.certificateSerial ? (
                          <a
                            href={`/verifikasi/${request.verificationCode}`}
                            className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-2.5 text-xs font-medium text-fg-muted transition-colors hover:border-slate-400 hover:text-fg"
                          >
                            <QrCode className="size-3.5" aria-hidden />
                            Verifikasi
                          </a>
                        ) : null}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="px-1 text-[10px] leading-4 text-fg-subtle">
        Salinan PDF hanya tersedia setelah surat ditandatangani secara elektronik oleh
        Kepala Desa. Keaslian dokumen dapat diperiksa siapa pun melalui tautan
        verifikasi pada setiap surat.
      </p>
    </div>
  );
}

function IdentityTerm({
  icon: Icon,
  term,
  detail,
  mono,
}: {
  icon: typeof IdCard;
  term: string;
  detail: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-fg-subtle">
        <Icon className="size-3" aria-hidden />
        {term}
      </dt>
      <dd
        className={`mt-0.5 truncate text-xs text-fg ${mono ? "tnum font-mono" : ""}`}
        title={detail}
      >
        {detail}
      </dd>
    </div>
  );
}
