"use client";

import {
  ArrowRight,
  IdCard,
  Inbox,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  RefreshCw,
  Stamp,
  Users,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd, Panel, PanelHeader } from "@/components/ui/primitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ANNOUNCEMENT_STATUS, TONE_CLASSES } from "@/lib/domain";
import { formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage, useGetWorkspaceQuery } from "@/store/api";

import { ActivityFeed } from "./activity-feed";
import { QueryErrorState } from "./feedback";
import { KpiRow } from "./kpi-row";
import { useNow } from "./now-context";
import { PageHeader } from "./page-kit";

/**
 * The dashboard landing: an operational summary of the whole village service
 * desk. The citizen-report register lives on `/laporan` — this page links to
 * it instead of embedding it.
 */
export function OverviewWorkspace() {
  const now = useNow();
  const { data, isLoading, isFetching, isError, error, refetch } =
    useGetWorkspaceQuery();

  if (isError || (!isLoading && !data)) {
    return (
      <>
        <PageHeader
          eyebrow="Operasional"
          icon={LayoutDashboard}
          title="Dashboard Pelayanan Desa"
          description="Ringkasan operasional pelayanan Desa Sukamaju."
        />
        <QueryErrorState
          title="Gagal memuat ringkasan pelayanan"
          message={errorMessage(error)}
          onRetry={() => refetch()}
        />
      </>
    );
  }

  if (!data) {
    // First paint: the KPI cards render their own skeleton row.
    return (
      <>
        <PageHeader
          eyebrow="Operasional"
          icon={LayoutDashboard}
          title="Dashboard Pelayanan Desa"
          description="Memuat ringkasan operasional pelayanan desa…"
        />
        <KpiRow loading />
      </>
    );
  }

  const unprocessedTotal =
    (data.queue.statusCounts.PENDING_VERIFIKASI ?? 0) +
    (data.queue.statusCounts.BERKAS_TIDAK_LENGKAP ?? 0);
  const queueOpen =
    unprocessedTotal +
    (data.queue.statusCounts.DIVERIFIKASI ?? 0) +
    (data.queue.statusCounts.MENUNGGU_TTD_KADES ?? 0);

  const shortcuts = [
    {
      id: "antrean",
      href: "/antrean",
      icon: Inbox,
      label: "Antrean Pengajuan Surat",
      description: "Verifikasi berkas dan teruskan ke tanda tangan",
      count: queueOpen,
      countLabel: "pengajuan aktif",
      tone: (unprocessedTotal > 0 ? "pending" : "neutral") as "pending" | "neutral",
    },
    {
      id: "ttd",
      href: "/ttd",
      icon: Stamp,
      label: "Agenda TTD Kepala Desa",
      description: "Surat yang menunggu tanda tangan elektronik",
      count: data.kpi.signaturesPending,
      countLabel: "menunggu TTD",
      tone: (data.kpi.signaturesPending > 0 ? "progress" : "neutral") as
        | "progress"
        | "neutral",
    },
    {
      id: "laporan",
      href: "/laporan",
      icon: MessagesSquare,
      label: "Laporan & Aspirasi Warga",
      description: "Register pengaduan dan status penanganan",
      count: data.kpi.reportsNew + data.kpi.reportsInProgress,
      countLabel: `${data.kpi.reportsNew} laporan baru`,
      tone: (data.kpi.reportsNew > 0 ? "pending" : "neutral") as "pending" | "neutral",
    },
    {
      id: "penduduk",
      href: "/penduduk",
      icon: Users,
      label: "Data Penduduk",
      description: "Registrasi penduduk dan mutasi kependudukan",
      count: data.kpi.activeResidents,
      countLabel: "jiwa aktif",
      tone: "neutral" as const,
    },
    {
      id: "keluarga",
      href: "/keluarga",
      icon: IdCard,
      label: "Kartu Keluarga",
      description: "Kepala keluarga dan klasifikasi kesejahteraan",
      count: data.kpi.activeFamilies,
      countLabel: "KK terdaftar",
      tone: "neutral" as const,
    },
    {
      id: "pengumuman",
      href: "/pengumuman",
      icon: Megaphone,
      label: "Pengumuman Desa",
      description: "Kanal website, papan informasi, dan WhatsApp",
      count: data.announcements.length,
      countLabel: "terbaru tayang",
      tone: "neutral" as const,
    },
  ];

  return (
    <>
      {/* --- dark hero band (same language as /antrean) ------------------- */}
      <div className="relative overflow-hidden rounded-lg border border-ink bg-ink text-white">
        <div aria-hidden className="absolute inset-y-0 left-0 w-0.75 bg-civic" />
        <div className="relative flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/55">
              Dashboard Operator &amp; Perangkat Desa
            </p>
            <h1 className="mt-1 font-display text-lg font-bold tracking-[-0.02em] text-white">
              Ringkasan Pelayanan Desa Sukamaju
            </h1>
            <p className="mt-1 max-w-2xl text-2xs leading-4 text-white/70">
              Kondisi layanan hari ini dalam satu layar: antrean surat, agenda
              tanda tangan, laporan warga, dan pergerakan data kependudukan.
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <HeroStat
                label="Antrean surat"
                value={formatNumber(queueOpen)}
                hint="Pengajuan yang belum selesai diproses"
              />
              <HeroStat
                label="Lewat SLA"
                value={formatNumber(data.kpi.overdueCount)}
                hint="Berkas melewati batas waktu pelayanan"
                tone={data.kpi.overdueCount > 0 ? "danger" : "default"}
              />
              <HeroStat
                label="Laporan baru"
                value={formatNumber(data.kpi.reportsNew)}
                hint="Laporan warga yang belum ditindaklanjuti — buka register di /laporan"
                tone={data.kpi.reportsNew > 0 ? "danger" : "default"}
              />
              <HeroStat
                label="Menunggu TTD"
                value={formatNumber(data.kpi.signaturesPending)}
                hint="Surat dalam agenda tanda tangan Kepala Desa"
              />
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-1.5 lg:w-auto lg:shrink-0">
            <span className="hidden text-[10px] text-white/60 sm:block">
              Diperbarui {formatRelative(data.serverTime, now)}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto border border-white/15 bg-white/10 text-white hover:border-white/25 hover:bg-white/15 hover:text-white lg:ml-0"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  aria-label="Muat ulang seluruh data pelayanan"
                >
                  <RefreshCw className={cn(isFetching && "animate-spin")} aria-hidden />
                  {isFetching ? "Menyegarkan…" : "Segarkan"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Memuat ulang KPI, aktivitas, dan pengumuman terbaru.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <KpiRow kpi={data.kpi} loading={isLoading} />

      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel className="min-h-104">
          <PanelHeader
            title="Aktivitas Pelayanan Terkini"
            description="Jejak audit persetujuan, tanda tangan, cetak surat, mutasi penduduk, dan perubahan data."
            icon={MessagesSquare}
            action={
              <span className="rounded-xs border border-line bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-fg-subtle">
                Audit Permanen
              </span>
            }
          />
          <ActivityFeed
            entries={data.activity}
            loading={isLoading}
            onRefresh={() => refetch()}
            refreshing={isFetching}
          />
        </Panel>

        <div className="grid content-start gap-3.5">
          <Panel>
            <PanelHeader
              title="Pintasan Pelayanan"
              description="Buka modul kerja sesuai beban hari ini."
              icon={LayoutDashboard}
            />
            <ul className="divide-y divide-line">
              {shortcuts.map((shortcut) => (
                <li key={shortcut.id}>
                  <Link
                    href={shortcut.href}
                    className="group flex items-center gap-2.5 px-3.5 py-2 transition-colors hover:bg-surface-muted"
                    aria-label={`${shortcut.label} — ${shortcut.count} ${shortcut.countLabel}`}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-sm border border-line bg-surface-muted text-fg-subtle transition-colors group-hover:border-civic/30 group-hover:text-civic">
                      <shortcut.icon className="size-3.5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-fg">
                        {shortcut.label}
                      </span>
                      <span className="block truncate text-[10px] text-fg-subtle">
                        {shortcut.description}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="tnum font-mono text-xs font-semibold text-fg">
                        {formatNumber(shortcut.count)}
                      </span>
                      <Badge
                        variant={shortcut.tone === "neutral" ? "outline" : shortcut.tone}
                        size="sm"
                        className={cn(
                          shortcut.tone === "pending" && TONE_CLASSES.pending.chip,
                          shortcut.tone === "progress" && TONE_CLASSES.progress.chip,
                        )}
                      >
                        {shortcut.countLabel}
                      </Badge>
                    </span>
                    <ArrowRight
                      className="size-3.5 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <PanelHeader
              title="Pengumuman Terakhir"
              description="Lima pengumuman terbaru dari kanal desa."
              icon={Megaphone}
              action={
                <Link
                  href="/pengumuman"
                  className="text-2xs font-medium text-civic hover:underline"
                >
                  Kelola
                </Link>
              }
            />
            {data.announcements.length === 0 ? (
              <p className="px-3.5 py-3 text-2xs text-fg-subtle">
                Belum ada pengumuman yang diterbitkan.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {data.announcements.slice(0, 4).map((announcement) => {
                  const statusMeta =
                    ANNOUNCEMENT_STATUS[announcement.status] ?? {
                      label: announcement.status,
                      tone: "neutral" as const,
                    };
                  return (
                    <li key={announcement.id} className="px-3.5 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-fg" title={announcement.title}>
                            {announcement.title}
                          </span>
                          <span className="tnum block text-[10px] text-fg-subtle">
                            {announcement.authorName ?? "Perangkat desa"} ·{" "}
                            {formatRelative(announcement.createdAt, now)}
                          </span>
                        </span>
                        <Badge
                          variant="outline"
                          size="sm"
                          className={cn("shrink-0", TONE_CLASSES[statusMeta.tone].chip)}
                        >
                          {statusMeta.label}
                        </Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <p className="px-1 text-[10px] leading-4 text-fg-subtle">
        Register lengkap laporan warga berada di halaman <Link href="/laporan" className="text-civic hover:underline">Laporan Warga</Link>.
        Gunakan <Kbd>/</Kbd> untuk mencari warga, pengajuan, atau tiket laporan lintas modul.
      </p>
    </>
  );
}

function HeroStat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "danger";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "rounded-sm border px-2.5 py-1.5",
            tone === "danger"
              ? "border-rejected-solid/40 bg-rejected-solid/15"
              : "border-white/12 bg-white/[0.07]",
          )}
          tabIndex={0}
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-white/55">{label}</p>
          <p
            className={cn(
              "tnum mt-0.5 font-display text-sm font-bold leading-none",
              tone === "danger" ? "text-rose-200" : "text-white",
            )}
          >
            {value}
          </p>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{hint}</TooltipContent>
    </Tooltip>
  );
}
