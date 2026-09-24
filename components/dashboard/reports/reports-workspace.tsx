"use client";

import {
  CheckCheck,
  Clock3,
  Megaphone,
  MessageSquareWarning,
  RefreshCw,
  Inbox,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/primitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { REPORT_CATEGORY, REPORT_SORT_LABEL, TONE_CLASSES } from "@/lib/domain";
import { formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage, useListReportsQuery } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  activeReportFilterCount,
  reportsActions,
  type ReportCategoryFilter,
} from "@/store/reports-slice";
import type { ReportPage } from "@/db/queries";

import { QueryErrorState } from "../feedback";
import { useNow } from "../now-context";
import {
  ClearFiltersButton,
  FacetMenu,
  PageHeader,
  Pager,
  PresetChip,
  ResultLabel,
  SearchBox,
  SortMenu,
  StatCard,
  StatStrip,
  Toolbar,
  ToolbarRow,
} from "../page-kit";
import { ReportDrawer } from "./report-drawer";
import { ReportSummaryPanel } from "./report-summary";
import { ReportTable } from "./report-table";

/**
 * Citizen reports and aspirations — the whole of the landing route, and the
 * register at /laporan.
 *
 * One component, two densities:
 *  - `landing` puts the summary beside the table, because that is the page the
 *    officer opens first thing in the morning and the headline figures are the
 *    reason they opened it;
 *  - `register` gives the table the full width and keeps the summary in a
 *    side rail, because by then the officer is working a specific queue.
 *
 * Both read the same Redux slice, so a category clicked on the dashboard is
 * still applied when the officer follows it into the register.
 */
export function ReportsWorkspace({
  variant = "landing",
  eyebrow,
}: {
  variant?: "landing" | "register";
  eyebrow?: string;
}) {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((state) => state.reports);
  const filterCount = useAppSelector((state) => activeReportFilterCount(state.reports));
  const searchRef = React.useRef<HTMLInputElement>(null);
  const now = useNow();

  const queryArgs = React.useMemo(
    () => ({
      q: filters.q,
      status: filters.statuses,
      category: filters.categories,
      dusun: filters.dusun,
      response: filters.response,
      sort: filters.sort,
      page: filters.page,
      pageSize: filters.pageSize,
    }),
    [
      filters.q,
      filters.statuses,
      filters.categories,
      filters.dusun,
      filters.response,
      filters.sort,
      filters.page,
      filters.pageSize,
    ],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useListReportsQuery(queryArgs);

  /* "f" jumps to this page's own filter box, the same shortcut the worklist
     uses — muscle memory should not have to be route-aware. */
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

  const selectedRow =
    data?.rows.find((row) => row.id === filters.selectedId) ?? null;

  const resultLabel = data
    ? data.total === 0
      ? "Tidak ada laporan yang cocok"
      : `${formatNumber(data.total)} laporan · halaman ${data.page} dari ${data.totalPages}`
    : "";

  if (isError) {
    return (
      <>
        <PageHeader
          eyebrow={eyebrow}
          icon={Megaphone}
          title={
            variant === "landing" ? "Laporan & Aspirasi Warga" : "Register Laporan Warga"
          }
          description="Pusat penerimaan aduan, aspirasi, dan laporan warga Desa Sukamaju."
        />
        <QueryErrorState
          title="Gagal memuat laporan warga"
          message={errorMessage(error)}
          onRetry={() => refetch()}
        />
      </>
    );
  }

  return (
    <>
      {variant === "landing" ? (
        <LandingBand data={data} now={now} loading={isLoading} onRefresh={() => refetch()} refreshing={isFetching} />
      ) : (
        <PageHeader
          eyebrow={eyebrow ?? "Layanan Publik"}
          icon={Megaphone}
          title="Register Laporan Warga"
          description="Seluruh laporan dan aspirasi warga yang tercatat di desa, lengkap dengan status penanganan dan riwayat tanggapan."
          meta={
            <span className="tnum text-2xs text-fg-subtle">
              {formatNumber(data?.summary.total ?? 0)} laporan tercatat
            </span>
          }
        />
      )}

      {/* --- headline filter shortcuts -------------------------------- */}
      <StatStrip>
        <StatCard
          label="Total laporan"
          value={formatNumber(data?.summary.total ?? 0)}
          unit="laporan"
          hint="Sejak kanal pengaduan warga dibuka"
          icon={Inbox}
          active={filterCount === 0}
          onClick={() => dispatch(reportsActions.filtersCleared())}
        />
        <StatCard
          label="Baru masuk"
          value={formatNumber(data?.summary.newCount ?? 0)}
          unit="laporan"
          hint="Belum ada petugas yang menangani"
          tone="pending"
          icon={MessageSquareWarning}
          active={filters.statuses.length === 1 && filters.statuses[0] === "NEW"}
          onClick={() => {
            dispatch(reportsActions.filtersCleared());
            dispatch(reportsActions.statusesReplaced(["NEW"]));
          }}
        />
        <StatCard
          label="Belum ditanggapi"
          value={formatNumber(data?.summary.unanswered ?? 0)}
          unit="laporan"
          hint="Tanpa tanggapan petugas sama sekali"
          tone="pending"
          icon={Clock3}
          active={filters.response === "unanswered"}
          onClick={() =>
            filters.response === "unanswered"
              ? dispatch(reportsActions.responseChanged("all"))
              : dispatch(reportsActions.focusUnanswered())
          }
        />
        <StatCard
          label="Selesai bulan ini"
          value={formatNumber(data?.summary.resolvedThisMonth ?? 0)}
          unit="laporan"
          hint={
            data?.summary.avgResolveHours !== null && data
              ? `Rata-rata penanganan ${data.summary.avgResolveHours} jam`
              : "Belum ada laporan yang selesai"
          }
          tone="approved"
          icon={CheckCheck}
          active={filters.statuses.length === 1 && filters.statuses[0] === "RESOLVED"}
          onClick={() => {
            dispatch(reportsActions.filtersCleared());
            dispatch(reportsActions.statusesReplaced(["RESOLVED"]));
          }}
        />
      </StatStrip>

      {/* On the landing route the summary is its own section *above* the
          register: a six-column register plus a side rail cannot both be
          legible on a 1440px laptop, and the table is the thing an officer
          works in all day. */}
      {variant === "landing" ? (
        <ReportSummaryPanel
          data={data}
          layout="split"
          loading={isLoading}
          activeCategories={filters.categories}
          activeStatuses={filters.statuses}
          onCategorySelect={(category) =>
            dispatch(reportsActions.categoriesReplaced([category as ReportCategoryFilter]))
          }
        />
      ) : null}

      <div className="grid gap-3.5">
        {/* --- the register ------------------------------------------- */}
        <Panel className="min-w-0">
          <PanelHeader
            title="Laporan & Aspirasi Warga"
            description="Aduan infrastruktur, kebersihan, keamanan, air bersih, dan layanan publik dari kanal website serta WhatsApp."
            icon={Megaphone}
            action={
              <>
                <ResultLabel>{resultLabel}</ResultLabel>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refetch()}
                      disabled={isFetching}
                      aria-label="Muat ulang daftar laporan"
                    >
                      <RefreshCw className={cn(isFetching && "animate-spin")} aria-hidden />
                      Segarkan
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    Memuat ulang ringkasan dan tabel dari basis data desa.
                  </TooltipContent>
                </Tooltip>
              </>
            }
          />

          <Toolbar>
            <ToolbarRow>
              <SearchBox
                value={filters.q}
                inputRef={searchRef}
                onChange={(value) => dispatch(reportsActions.searchChanged(value))}
                placeholder="Cari tiket, subjek laporan, isi aduan, atau nama pelapor…"
                label="Cari laporan warga"
              />

              <FacetMenu
                label="Status"
                selected={filters.statuses}
                onToggle={(value) =>
                  dispatch(
                    reportsActions.statusToggled(
                      value as (typeof filters.statuses)[number],
                    ),
                  )
                }
                onClear={() => dispatch(reportsActions.statusesReplaced([]))}
                options={[
                  { value: "NEW", label: "Baru", tone: "pending", count: data?.statusCounts.NEW ?? 0 },
                  {
                    value: "IN_PROGRESS",
                    label: "Sedang Dikerjakan",
                    tone: "progress",
                    count: data?.statusCounts.IN_PROGRESS ?? 0,
                  },
                  {
                    value: "RESOLVED",
                    label: "Selesai",
                    tone: "approved",
                    count: data?.statusCounts.RESOLVED ?? 0,
                  },
                  {
                    value: "REJECTED",
                    label: "Ditolak",
                    tone: "rejected",
                    count: data?.statusCounts.REJECTED ?? 0,
                  },
                ]}
              />

              <FacetMenu
                label="Kategori"
                selected={filters.categories}
                onToggle={(value) =>
                  dispatch(
                    reportsActions.categoryToggled(
                      value as (typeof filters.categories)[number],
                    ),
                  )
                }
                onClear={() => dispatch(reportsActions.categoriesReplaced([]))}
                options={(data?.categoryCounts ?? []).map((entry) => ({
                  value: entry.category,
                  label: REPORT_CATEGORY[entry.category] ?? entry.category,
                  count: entry.count,
                }))}
              />

              <FacetMenu
                label="Dusun"
                selected={filters.dusun}
                onToggle={(value) => dispatch(reportsActions.dusunToggled(value))}
                onClear={() => dispatch(reportsActions.dusunReplaced([]))}
                options={(data?.dusunCounts ?? []).map((entry) => ({
                  value: entry.code,
                  label: entry.name,
                  count: entry.count,
                }))}
              />

              <SortMenu
                value={filters.sort}
                options={REPORT_SORT_LABEL}
                onChange={(value) =>
                  dispatch(reportsActions.sortChanged(value as typeof filters.sort))
                }
                label="Urutkan laporan"
              />

              <ClearFiltersButton
                count={filterCount}
                onClick={() => dispatch(reportsActions.filtersCleared())}
              />
            </ToolbarRow>

            <ToolbarRow>
              <span className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">
                Tampilan cepat
              </span>
              <PresetChip
                active={filters.response === "unanswered"}
                tone="pending"
                count={data?.summary.unanswered ?? 0}
                onClick={() => dispatch(reportsActions.focusUnanswered())}
              >
                Belum ditanggapi
              </PresetChip>
              <PresetChip
                active={
                  filters.statuses.length === 2 &&
                  filters.statuses.includes("NEW") &&
                  filters.statuses.includes("IN_PROGRESS")
                }
                tone="progress"
                onClick={() => dispatch(reportsActions.focusOpen())}
              >
                Masih berjalan
              </PresetChip>
              <PresetChip
                active={filters.categories.length === 1 && filters.categories[0] === "INFRASTRUKTUR"}
                onClick={() =>
                  dispatch(reportsActions.categoriesReplaced(["INFRASTRUKTUR"]))
                }
              >
                Infrastruktur
              </PresetChip>
              <PresetChip
                active={filters.categories.length === 1 && filters.categories[0] === "KEAMANAN"}
                onClick={() => dispatch(reportsActions.categoriesReplaced(["KEAMANAN"]))}
              >
                Keamanan
              </PresetChip>
            </ToolbarRow>
          </Toolbar>

          <ReportTable
            rows={data?.rows ?? []}
            loading={isLoading || (isFetching && !data?.rows.length)}
            selectedId={filters.selectedId}
            onSelect={(id) => dispatch(reportsActions.reportSelected(id))}
            emptyTitle={
              filterCount > 0 ? "Tidak ada laporan yang cocok" : "Belum ada laporan warga"
            }
            emptyMessage={
              filterCount > 0
                ? "Longgarkan saringan atau ubah kata kunci untuk melihat laporan lain."
                : "Laporan yang masuk dari website desa dan kanal WhatsApp warga akan muncul di sini."
            }
          />

          {data ? (
            <Pager
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              totalPages={data.totalPages}
              onPage={(page) => dispatch(reportsActions.pageChanged(page))}
              onPageSize={(size) => dispatch(reportsActions.pageSizeChanged(size))}
              noun="laporan"
            />
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-muted px-3.5 py-1.5">
            <p className="text-[10px] leading-4 text-fg-subtle">
              Laporan warga wajib ditanggapi paling lambat 5 hari kerja sesuai Perdes Pelayanan
              Publik.
            </p>
            <span className="tnum shrink-0 text-[10px] text-fg-subtle">
              {data?.summary.lastSubmittedAt
                ? `Laporan terakhir ${formatRelative(data.summary.lastSubmittedAt, now)}`
                : ""}
            </span>
          </div>
        </Panel>

      </div>

      {variant === "register" ? (
        <ReportSummaryPanel
          data={data}
          layout="split"
          loading={isLoading}
          activeCategories={filters.categories}
          activeStatuses={filters.statuses}
          onCategorySelect={(category) =>
            dispatch(reportsActions.categoriesReplaced([category as ReportCategoryFilter]))
          }
        />
      ) : null}

      <ReportDrawer
        report={selectedRow}
        onClose={() => dispatch(reportsActions.reportSelected(null))}
      />
    </>
  );
}

/**
 * The landing context band.
 *
 * Keeps the two figures the brief calls out by name — how many reports are new
 * and how many are being worked — in the one place that is true on every load,
 * independent of whatever the table below happens to be filtered to.
 */
function LandingBand({
  data,
  now,
  loading,
  onRefresh,
  refreshing,
}: {
  data?: ReportPage;
  now: number;
  loading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const summary = data?.summary;

  return (
    <div className="relative overflow-hidden rounded-lg border border-ink bg-ink text-white">
      {/* Flat civic-navy fill with a single rule — no gradient, no glow. */}
      <div aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-civic" />
      <div className="relative flex flex-wrap items-start justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/55">
            Dashboard Operator &amp; Perangkat Desa
          </p>
          <h1 className="mt-1 font-display text-lg font-bold tracking-[-0.02em] text-white">
            Laporan &amp; Aspirasi Warga
          </h1>
          <p className="mt-1 max-w-2xl text-2xs leading-4 text-white/70">
            Seluruh aduan dan aspirasi warga Desa Sukamaju dalam satu daftar kerja: status
            penanganan, tanggapan petugas, dan sebaran per dusun.
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <BandChip
              tone="pending"
              label="Baru"
              value={loading ? "—" : formatNumber(summary?.newCount ?? 0)}
            />
            <BandChip
              tone="progress"
              label="Sedang Dikerjakan"
              value={loading ? "—" : formatNumber(summary?.inProgress ?? 0)}
            />
            <BandChip
              tone="approved"
              label="Selesai"
              value={loading ? "—" : formatNumber(summary?.resolved ?? 0)}
            />
            <BandChip
              tone="neutral"
              label="Total"
              value={loading ? "—" : formatNumber(summary?.total ?? 0)}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {summary?.lastSubmittedAt ? (
            <span className="hidden text-[10px] text-white/60 sm:block">
              Laporan terakhir {formatRelative(summary.lastSubmittedAt, now)}
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="border border-white/15 bg-white/10 text-white hover:border-white/25 hover:bg-white/15 hover:text-white"
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} aria-hidden />
            {refreshing ? "Menyegarkan…" : "Segarkan"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BandChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "pending" | "progress" | "approved" | "neutral";
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-white/12 bg-white/[0.07] px-2 py-1">
      <span className={cn("size-1.5 rounded-full", TONE_CLASSES[tone].dot)} aria-hidden />
      <span className="text-[10px] font-medium text-white/60">{label}</span>
      <span className="tnum font-mono text-2xs font-semibold text-white">{value}</span>
    </span>
  );
}
