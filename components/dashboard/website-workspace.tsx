"use client";

import { ExternalLink, Globe, QrCode, Search, ShieldCheck, Siren } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Panel, PanelHeader } from "@/components/ui/primitives";
import { ANNOUNCEMENT_CHANNEL } from "@/lib/domain";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { useGetShellQuery, useListAnnouncementsQuery } from "@/store/api";

import { useNow } from "./now-context";
import { PageHeader, StatCard, StatStrip } from "./page-kit";

/**
 * Website Desa.
 *
 * The operator's view of what the public actually sees: the domain, the
 * published notices, and the certificate lookup that citizens and other
 * agencies use to confirm a letter is genuine. The lookup here only *builds* the
 * public URL — verification itself stays on the public page, which anyone can
 * open without a session.
 */
export function WebsiteWorkspace() {
  const now = useNow();
  const shell = useGetShellQuery();
  const announcements = useListAnnouncementsQuery();
  const [code, setCode] = React.useState("");

  const village = shell.data?.village;
  const rows = announcements.data?.announcements ?? [];
  const published = rows.filter((row) => row.status === "TERBIT");
  const scheduled = rows.filter((row) => row.status === "TERJADWAL");
  const channels = new Set(rows.map((row) => row.channel));
  const normalized = code.trim().toUpperCase();
  const lookupHref = normalized ? `/verifikasi/${normalized}` : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Publikasi · Kanal Warga"
        icon={Globe}
        title="Website Desa & Layanan Publik Digital"
        description="Status kanal informasi publik Desa Sukamaju: domain resmi, pengumuman yang tayang, dan halaman verifikasi surat untuk warga."
        meta={
          <Badge variant="outline" size="sm">
            <Globe className="size-3" aria-hidden />
            {village?.website ?? "sukamaju.desa.id"}
          </Badge>
        }
      />

      <StatStrip>
        <StatCard
          label="Pengumuman tayang"
          value={formatNumber(published.length)}
          unit="pengumuman"
          hint="Terlihat warga di beranda website desa"
          tone="approved"
          icon={Globe}
        />
        <StatCard
          label="Terjadwal terbit"
          value={formatNumber(scheduled.length)}
          unit="pengumuman"
          hint="Dirilis otomatis tanpa campur tangan operator"
          tone="pending"
          icon={Siren}
        />
        <StatCard
          label="Kanal aktif"
          value={formatNumber(channels.size)}
          unit="kanal"
          hint={[...channels]
            .map((channel) => ANNOUNCEMENT_CHANNEL[channel]?.label ?? channel)
            .join(" · ")}
          icon={Globe}
        />
        <StatCard
          label="Sertifikat terverifikasi"
          value={formatNumber(shell.data?.counts.announcementsPublished ?? 0)}
          unit="dokumen"
          hint="Surat ber-QR yang dapat dicek keasliannya oleh warga"
          tone="progress"
          icon={ShieldCheck}
        />
      </StatStrip>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader
            title="Identitas Publik Desa"
            description="Data yang dicetak pada kop surat, sertifikat digital, dan halaman depan website desa."
            icon={Globe}
            action={
              village?.website ? (
                <Button variant="secondary" size="sm" asChild>
                  <a href={village.website} target="_blank" rel="noopener noreferrer">
                    <ExternalLink aria-hidden />
                    Buka website
                  </a>
                </Button>
              ) : null
            }
          />
          <dl className="grid gap-x-6 gap-y-3 px-3.5 py-3 sm:grid-cols-2">
            <Field term="Nama pemerintah desa" detail={village?.name ?? "—"} />
            <Field term="Kode desa" detail={village?.villageCode ?? "—"} mono />
            <Field term="Kecamatan" detail={village?.district ?? "—"} />
            <Field term="Kabupaten" detail={village?.regency ?? "—"} />
            <Field term="Kepala Desa" detail={village?.headName ?? "—"} />
            <Field term="Alamat kantor" detail={village?.officeAddress ?? "—"} />
            <Field term="Telepon" detail={village?.officePhone ?? "—"} mono />
            <Field term="Surel" detail={village?.officeEmail ?? "—"} mono />
          </dl>
        </Panel>

        <Panel>
          <PanelHeader
            title="Verifikasi Surat Warga"
            description="Masukkan kode verifikasi yang tercetak pada QR surat untuk membuka halaman keaslian dokumen."
            icon={QrCode}
          />
          <div className="space-y-3 px-3.5 py-3">
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-[0.05em] text-fg-subtle">
                Kode verifikasi
              </span>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="Contoh: BGTACMESNKDL"
                  className="font-mono uppercase tracking-wider"
                  aria-label="Kode verifikasi surat"
                />
                <Button variant="primary" size="sm" asChild disabled={!lookupHref}>
                  <a
                    href={lookupHref ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={!lookupHref}
                  >
                    <Search aria-hidden />
                    Periksa
                  </a>
                </Button>
              </div>
            </label>

            <p className="rounded-sm border border-line bg-surface-muted px-3 py-2 text-[10px] leading-4 text-fg-subtle">
              Halaman verifikasi dapat dibuka siapa pun tanpa login. Setiap surat elektronik
              membawa nomor sertifikat BSrE, waktu tanda tangan, dan nama penandatangan yang
              tersimpan permanen di basis data desa.
            </p>

            <ul className="space-y-1.5">
              {[
                "QR pada surat mengarah ke /verifikasi/{kode}",
                "Kode unik dibuat sekali per pengajuan dan tidak dapat diubah",
                "Status keaslian dihitung dari sertifikat tanda tangan digital",
              ].map((item) => (
                <li key={item} className="flex items-start gap-1.5 text-2xs leading-4 text-fg-muted">
                  <ShieldCheck className="mt-0.5 size-3 shrink-0 text-approved" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Tayangan Publik Terakhir"
          description="Pengumuman yang sudah atau akan segera tampil di kanal warga."
          icon={Globe}
        />
        {published.length === 0 && scheduled.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-2xs text-fg-subtle">
            Belum ada pengumuman yang tayang di kanal publik desa.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {[...published, ...scheduled].slice(0, 6).map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-fg">{row.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-2xs leading-4 text-fg-muted">
                    {row.excerpt ?? "Tanpa ringkasan."}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tnum text-[10px] text-fg-subtle">
                    {row.publishAt ? formatRelative(row.publishAt, now) : "Belum terjadwal"}
                  </p>
                  <p className="tnum text-[10px] text-fg-subtle">
                    {ANNOUNCEMENT_CHANNEL[row.channel]?.label ?? row.channel}
                    {row.publishAt ? ` · ${formatDateTime(row.publishAt)}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

function Field({ term, detail, mono }: { term: string; detail: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.05em] text-fg-subtle">{term}</dt>
      <dd
        className={`mt-0.5 truncate text-xs text-fg ${mono ? "font-mono tabular-nums" : ""}`}
        title={detail}
      >
        {detail}
      </dd>
    </div>
  );
}
