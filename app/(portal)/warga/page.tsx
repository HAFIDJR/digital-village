import type { Metadata } from "next";
import {
  ArrowRight,
  CalendarDays,
  IdCard,
  MapPin,
  MessagesSquare,
  Users,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RequestPanel } from "@/components/portal/request-panel";
import { getResidentPortalData } from "@/db/queries";
import { requireResidentPage } from "@/lib/auth/guard";
import { formatKk, formatNik } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Portal Warga",
  description:
    "Ajukan surat administrasi dan pantau status pengajuan Anda di Desa Sukamaju, lengkap dengan salinan yang telah ditandatangani.",
  robots: { index: false, follow: false },
};

export default async function WargaPortalPage() {
  const actor = await requireResidentPage();
  const data = await getResidentPortalData(actor.resident.id);
  if (!data) redirect("/warga/masuk");

  const { resident, family, requests, reports } = data;
  const downloadable = requests.filter((r) => r.downloadable).length;
  const inProgress = requests.filter(
    (r) => !["SELESAI", "DITOLAK"].includes(r.status),
  ).length;
  const openReports = reports.filter((r) =>
    ["NEW", "IN_PROGRESS"].includes(r.status),
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
          Selamat datang, {resident.fullName}. Ajukan surat administrasi dari
          portal ini dan pantau statusnya tanpa harus datang ke balai desa.
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
        <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-muted px-4 py-2">
          <p className="text-2xs text-fg-subtle">
            {openReports > 0
              ? `${openReports} laporan Anda masih ditindaklanjuti perangkat desa.`
              : "Sampaikan keluhan atau aspirasi Anda kepada perangkat desa."}
          </p>
          <Link
            href="/warga/laporan"
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-2.5 text-xs font-medium text-fg-muted transition-colors hover:border-slate-400 hover:text-fg"
          >
            <MessagesSquare className="size-3.5" aria-hidden />
            Laporan &amp; Aspirasi
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------------- requests */}
      <RequestPanel />

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
