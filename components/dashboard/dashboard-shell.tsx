"use client";

import { Inbox, Megaphone, MessagesSquare, RefreshCw, ScanSearch } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Kbd, Panel, PanelHeader, Skeleton } from "@/components/ui/primitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ROLE_CAPABILITIES } from "@/lib/domain";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage, useGetWorkspaceQuery } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store";
import { queueActions } from "@/store/queue-slice";
import { uiActions } from "@/store/ui-slice";
import type { QueueQuery } from "@/lib/validators";
import type { StaffRole } from "@/db/schema";
import type { VillageProfile } from "@/db/queries";

import { ActivityFeed } from "./activity-feed";
import { AnnouncementComposer } from "./announcement-composer";
import { CommandPalette } from "./command-palette";
import { QueryErrorState, ToastHost } from "./feedback";
import { KpiRow } from "./kpi-row";
import { ReportPanel } from "./report-panel";
import { ReviewDrawer } from "./review-drawer";
import { QueueAlertStrip, QueueTable } from "./queue/queue-table";
import { QueuePagination, QueueToolbar } from "./queue/queue-toolbar";
import { NowProvider } from "./now-context";
import { Sidebar, SidebarDrawer, type NavCounts } from "./sidebar";
import { heroBandClasses } from "./hero-band";
import { Topbar } from "./topbar";

/**
 * Identity rendered before the first payload arrives (and if it never does), so
 * the chrome never collapses or shows an empty header.
 */
const fallbackVillage: VillageProfile = {
  id: "",
  name: "Desa Sukamaju",
  district: "Kecamatan Cimaung",
  regency: "Kabupaten Bandung",
  province: "Jawa Barat",
  villageCode: "32.04.16.2007",
  headName: "—",
  headNipd: null,
  officeAddress: "—",
  officePhone: "—",
  officeEmail: "—",
  website: null,
  sealUrl: "/seal-desa-sukamaju.svg",
  establishedYear: null,
};

/**
 * The dashboard.
 *
 * Layout is a single 24-column grid:
 *   - KPI row spans the full width (4 cards);
 *   - the worklist spans the full width beneath it — it is the primary
 *     workspace and nothing else may compete with it for horizontal space;
 *   - the secondary split sits below: audit trail wider (60%) than the
 *     announcement composer (40%), matching the brief.
 *
 * Only three things fetch: the workspace payload (KPIs + first page + feeds),
 * the worklist (filter/page changes) and the citizen reports. Everything else
 * renders from the RTK Query cache.
 */
export function DashboardShell() {
  const dispatch = useAppDispatch();
  const queue = useAppSelector((state) => state.queue);

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

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    fulfilledTimeStamp,
  } = useGetWorkspaceQuery(queryArgs);

  /* --------------------------------------------------- global shortcuts */
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      // "/" opens the global search from anywhere that is not already a field.
      if (event.key === "/" && !typing) {
        event.preventDefault();
        dispatch(uiActions.commandPaletteToggled(true));
        return;
      }
      // "f" focuses the worklist's own filter box.
      if (event.key === "f" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key === "Escape") {
        dispatch(uiActions.commandPaletteToggled(false));
        dispatch(queueActions.requestSelected(null));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch]);

  /* ------------------------------------------------------------ render */

  /**
   * The single clock for every relative timestamp on the page. It starts from
   * the server's own response time so the first paint matches what the server
   * rendered, and ticks locally afterwards.
   */
  const clock = data ? Date.parse(data.serverTime) : Number.NaN;
  const initialNow = Number.isNaN(clock) ? (fulfilledTimeStamp ?? 0) : clock;
  const now = React.useMemo(() => initialNow, [initialNow]);

  if (isError || (!isLoading && !data)) {
    return (
      <NowProvider initial={now}>
      <div className="min-h-screen">
        <Topbar
          village={fallbackVillage}
          officer={null}
          notifications={[]}
          unread={0}
          serverTime={now}
        />
        <div className="mx-auto w-full max-w-[1520px] p-4">
          <QueryErrorState
            title="Gagal memuat data desa"
            message={errorMessage(error)}
            onRetry={() => refetch()}
          />
        </div>
      </div>
      </NowProvider>
    );
  }

  const kpi = data?.kpi;

  // The widget is part of every officer's desk, but broadcasting is a licensed
  // act in this village — the button is gated on the acting officer's role
  // rather than failing after the message has been written.
  const canPublish = data?.officer
    ? (ROLE_CAPABILITIES[data.officer.role as StaffRole]?.publish ?? false)
    : false;
  const unprocessedTotal =
    (data?.queue.statusCounts.PENDING_VERIFIKASI ?? 0) +
    (data?.queue.statusCounts.BERKAS_TIDAK_LENGKAP ?? 0);

  const navCounts: NavCounts = {
    queueTotal: data?.queue.total ?? 0,
    unprocessed: unprocessedTotal,
    awaitingSignature: data?.queue.statusCounts.MENUNGGU_TTD_KADES ?? 0,
    reportsNew: data?.kpi.reportsNew ?? 0,
    residents: data?.kpi.activeResidents ?? 0,
    families: data?.kpi.activeFamilies ?? 0,
  };

  const resultLabel = data
    ? data.queue.total === 0
      ? "Tidak ada hasil"
      : `${formatNumber(data.queue.total)} pengajuan · halaman ${data.queue.page} dari ${data.queue.totalPages}`
    : "";

  return (
    <NowProvider initial={now}>
    <div className="min-h-screen">
      <Topbar
        village={data?.village ?? fallbackVillage}
        officer={data?.officer ?? null}
        notifications={data?.notifications ?? []}
        unread={(data?.notifications ?? []).filter((n) => n.readAt === null).length}
        serverTime={fulfilledTimeStamp ?? now}
        onMenuClick={() => dispatch(uiActions.navToggled(true))}
      />

      <div className="mx-auto flex w-full max-w-[1800px] items-start">
        <Sidebar
          village={data?.village ?? fallbackVillage}
          officer={data?.officer ?? null}
          counts={navCounts}
          serverTime={fulfilledTimeStamp ?? now}
        />

        <main
          id="konten-utama"
          className="min-w-0 flex-1 space-y-3.5 px-3 py-4 sm:px-4"
        >
        {/* ------------------------------------------------------ context band */}
        <div id="dasbor" className={cn(heroBandClasses, "scroll-mt-[4.75rem]")}>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-base font-bold tracking-[-0.015em] text-white">
                Dashboard Operator &amp; Perangkat Desa
              </h1>
              {data ? (
                <span className="hidden rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/80 sm:inline">
                  Semester II · {new Date(fulfilledTimeStamp ?? now).getFullYear()}
                </span>
              ) : null}
            </div>
            <p className="max-w-3xl text-2xs leading-4 text-white/65">
              Pusat kendali pelayanan administrasi: antrean pengajuan surat warga, verifikasi berkas,
              agenda tanda tangan Kepala Desa, dan publikasi pengumuman desa.
            </p>
          </div>

          <div className="flex w-full flex-wrap items-center gap-1.5 lg:w-auto lg:shrink-0">
            {data ? (
              <>
                <HeroStat
                  label="Antrean aktif"
                  value={formatNumber(
                    unprocessedTotal + (data.queue.statusCounts.DIVERIFIKASI ?? 0) +
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
                    data.kpi.avgTurnaroundHours !== null
                      ? `${data.kpi.avgTurnaroundHours} jam`
                      : "—"
                  }
                  hint="Rata-rata waktu penyelesaian 30 hari terakhir"
                />
              </>
            ) : null}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto border border-white/15 bg-white/10 text-white hover:border-white/25 hover:bg-white/15 hover:text-white lg:ml-0"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  aria-label="Muat ulang seluruh data dashboard"
                >
                  <RefreshCw className={cn(isFetching && "animate-spin")} aria-hidden />
                  {isFetching ? "Menyegarkan…" : "Segarkan"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Memuat ulang KPI, antrean, jejak audit, dan laporan warga.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* ----------------------------------------------------------- KPIs */}
        <div id="kependudukan" className="scroll-mt-[4.75rem]">
          <KpiRow kpi={kpi} loading={isLoading} />
        </div>

        {/* ------------------------------------------------------- worklist */}
        <Panel id="antrean" className="scroll-mt-[4.75rem]">
          <PanelHeader
            title="Antrean Pengajuan Surat Warga"
            description="Verifikasi berkas, teruskan ke tanda tangan, dan cetak surat dari satu daftar kerja."
            icon={Inbox}
            action={
              <>
                <span className="tnum hidden text-2xs text-fg-subtle md:inline">
                  {resultLabel}
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="hidden items-center gap-1 text-[10px] text-fg-subtle lg:inline-flex"
                      tabIndex={0}
                    >
                      <ScanSearch className="size-3" aria-hidden />
                      Ketik <Kbd>/</Kbd> untuk cari warga · <Kbd>f</Kbd> untuk saring tabel
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    Pintasan keyboard aktif selama kursor tidak berada di kolom isian.
                  </TooltipContent>
                </Tooltip>
              </>
            }
          />

          {data ? (
            <QueueAlertStrip
              overdueTotal={data.queue.overdueTotal}
              unprocessedTotal={unprocessedTotal}
              total={data.queue.total}
            />
          ) : null}

          <QueueToolbar
            data={data?.queue}
            resultLabel={resultLabel}
            searchInputRef={searchInputRef}
          />

          <QueueTable
            rows={data?.queue.rows ?? []}
            loading={isLoading || (isFetching && !data?.queue.rows.length)}
            now={now}
            focusRowIndex={queue.focusedIndex}
          />

          {data ? (
            <QueuePagination
              page={data.queue.page}
              pageSize={data.queue.pageSize}
              totalPages={data.queue.totalPages}
              total={data.queue.total}
            />
          ) : null}
        </Panel>

        {/* ------------------------------------------------ secondary split */}
        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Panel id="aktivitas" className="min-h-[26rem] scroll-mt-[4.75rem]">
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

          <Panel id="pengumuman" className="min-h-[26rem] scroll-mt-[4.75rem]">
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

        {/* ---------------------------------------------------------- reports */}
        <div id="laporan" className="scroll-mt-[4.75rem]">
          <ReportPanel reports={data?.reports ?? []} loading={isLoading} />
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2 pt-1">
          <p className="text-[10px] leading-4 text-fg-subtle">
            {data?.village.name} · {data?.village.officeAddress}
          </p>
          <p className="text-[10px] leading-4 text-fg-subtle">
            Data kependudukan tersinkronisasi dengan Disdukcapil {data?.village.regency ?? ""}.
            Perubahan status surat tercatat otomatis pada jejak audit desa.
          </p>
        </footer>
        </main>
      </div>

      <SidebarDrawer
        village={data?.village ?? fallbackVillage}
        officer={data?.officer ?? null}
        counts={navCounts}
        serverTime={fulfilledTimeStamp ?? now}
      />

      {/* ------------------------------------------------- overlays */}
      <ReviewDrawer />
      <CommandPalette />
      <ToastHost />

      {/* Screen-reader live region for queue mutations, so a filtered table that
          empties itself is announced rather than silently vanishing. */}
      <p aria-live="polite" className="sr-only">
        {data
          ? `Antrean menampilkan ${formatNumber(data.queue.total)} pengajuan, halaman ${data.queue.page} dari ${data.queue.totalPages}.`
          : ""}
      </p>

      {isLoading ? <ScreenSkeleton /> : null}
    </div>
    </NowProvider>
  );
}

/* -------------------------------------------------------------------------- */

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

function ScreenSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1520px] px-4 pb-6" aria-hidden>
      <Skeleton className="h-20 w-full rounded-lg" />
    </div>
  );
}
