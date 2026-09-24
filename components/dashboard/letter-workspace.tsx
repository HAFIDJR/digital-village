"use client";

import { Inbox, Megaphone, MessagesSquare, RefreshCw } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Kbd, Panel, PanelHeader } from "@/components/ui/primitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ROLE_CAPABILITIES } from "@/lib/domain";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage, useGetWorkspaceQuery } from "@/store/api";
import { useAppSelector } from "@/store";
import type { QueueQuery } from "@/lib/validators";
import type { StaffRole } from "@/db/schema";

import { ActivityFeed } from "./activity-feed";
import { AnnouncementComposer } from "./announcement-composer";
import { QueryErrorState } from "./feedback";
import { KpiRow } from "./kpi-row";
import { PageHeader } from "./page-kit";
import { QueuePanel, queueResultLabel } from "./queue/queue-panel";

/**
 * Antrean Pengajuan Surat — the service desk itself.
 *
 * This is where the operational KPIs, the letter worklist and the secondary
 * split (audit trail / announcement widget) live now that the landing route is
 * reserved for citizen reports. The page fetches one workspace payload, so the
 * KPI row and the table below it are computed from the same instant.
 */
export function LetterWorkspace() {
  const queue = useAppSelector((state) => state.queue);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const queryArgs = React.useMemo<Partial<QueueQuery>>(
    () => ({
      q: queue.search,
      status: queue.statuses,
      letterType: queue.letterTypes,
      dusun: queue.dusun,
      sla: queue.sla,
      sort: queue.sort,
      page: queue.page,
      pageSize: queue.pageSize,
    }),
    [
      queue.search,
      queue.statuses,
      queue.letterTypes,
      queue.dusun,
      queue.sla,
      queue.sort,
      queue.page,
      queue.pageSize,
    ],
  );

  const { data, isLoading, isFetching, isError, error, refetch, fulfilledTimeStamp } =
    useGetWorkspaceQuery(queryArgs);

  // "f" focuses this page's own filter box.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (event.key === "f" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (isError || (!isLoading && !data)) {
    return (
      <>
        <PageHeader
          eyebrow="Operasional"
          icon={Inbox}
          title="Antrean Pengajuan Surat Warga"
          description="Verifikasi berkas, teruskan ke tanda tangan Kepala Desa, dan cetak surat dari satu daftar kerja."
        />
        <QueryErrorState
          title="Gagal memuat antrean pengajuan"
          message={errorMessage(error)}
          onRetry={() => refetch()}
        />
      </>
    );
  }

  const unprocessedTotal =
    (data?.queue.statusCounts.PENDING_VERIFIKASI ?? 0) +
    (data?.queue.statusCounts.BERKAS_TIDAK_LENGKAP ?? 0);

  const canPublish = data?.officer
    ? (ROLE_CAPABILITIES[data.officer.role as StaffRole]?.publish ?? false)
    : false;

  return (
    <>
      {/* ---------------------------------------------------------- context */}
      <div className="relative overflow-hidden rounded-lg border border-ink bg-ink text-white">
        <div aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-civic" />
        <div className="relative flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/55">
              Layanan Administrasi Surat
            </p>
            <h1 className="mt-1 font-display text-lg font-bold tracking-[-0.02em] text-white">
              Antrean Pengajuan Surat Warga
            </h1>
            <p className="mt-1 max-w-2xl text-2xs leading-4 text-white/70">
              Pusat kendali pelayanan administrasi: verifikasi berkas, agenda tanda tangan Kepala
              Desa, dan pencetakan surat warga Desa Sukamaju.
            </p>

            {data ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <HeroStat
                  label="Antrean aktif"
                  value={formatNumber(
                    unprocessedTotal +
                      (data.queue.statusCounts.DIVERIFIKASI ?? 0) +
                      (data.queue.statusCounts.MENUNGGU_TTD_KADES ?? 0),
                  )}
                  hint="Pengajuan yang belum selesai diproses"
                />
                <HeroStat
                  label="Lewat SLA"
                  value={formatNumber(data.kpi.overdueCount)}
                  hint="Berkas melewati batas waktu pelayanan"
                  tone={data.kpi.overdueCount > 0 ? "danger" : "default"}
                />
                <HeroStat
                  label="Rata-rata layanan"
                  value={
                    data.kpi.avgTurnaroundHours !== null ? `${data.kpi.avgTurnaroundHours} jam` : "—"
                  }
                  hint="Rata-rata waktu penyelesaian 30 hari terakhir"
                />
              </div>
            ) : null}
          </div>

          <div className="flex w-full flex-wrap items-center gap-1.5 lg:w-auto lg:shrink-0">
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
                Memuat ulang KPI, antrean, jejak audit, dan pengumuman.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- KPIs */}
      <KpiRow kpi={data?.kpi} loading={isLoading} />

      {/* --------------------------------------------------------- worklist */}
      <QueuePanel
        queue={data?.queue}
        loading={isLoading || (isFetching && !data?.queue.rows.length)}
        resultLabel={queueResultLabel(data?.queue)}
        searchInputRef={searchRef}
      />

      {/* ------------------------------------------------- secondary split */}
      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel className="min-h-[26rem]">
          <PanelHeader
            title="Aktivitas Pelayanan Terkini"
            description="Jejak audit persetujuan, tanda tangan, cetak surat, dan mutasi penduduk."
            icon={MessagesSquare}
            action={
              <span className="rounded-xs border border-line bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-fg-subtle">
                Audit Permanen
              </span>
            }
          />
          <ActivityFeed
            entries={data?.activity ?? []}
            loading={isLoading}
            onRefresh={() => refetch()}
            refreshing={isFetching}
          />
        </Panel>

        <Panel className="min-h-[26rem]">
          <PanelHeader
            title="Widget Cepat Pengumuman Desa"
            description="Terbitkan pemberitahuan langsung ke website desa dan papan informasi."
            icon={Megaphone}
            action={
              <span className="hidden rounded-xs border border-progress-line/60 bg-progress-bg px-1.5 py-0.5 text-[10px] font-medium text-progress sm:inline">
                Kanal: Website Desa
              </span>
            }
          />
          <AnnouncementComposer
            announcements={data?.announcements ?? []}
            loading={isLoading}
            canPublish={canPublish}
          />
        </Panel>
      </div>

      <p className="px-1 text-[10px] leading-4 text-fg-subtle">
        Pergeseran status surat, tanda tangan elektronik, dan pencetakan otomatis tercatat pada jejak
        audit desa. Gunakan <Kbd>/</Kbd> untuk mencari warga lintas modul.
      </p>

      <span className="sr-only">
        Menampilkan {data?.queue.total ?? 0} pengajuan, halaman {data?.queue.page ?? 1} dari{" "}
        {data?.queue.totalPages ?? 1}. Diperbarui pada{" "}
        {fulfilledTimeStamp ? new Date(fulfilledTimeStamp).toISOString() : ""}.
      </span>
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
