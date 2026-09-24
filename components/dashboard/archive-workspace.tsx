"use client";

import { Archive, BadgeCheck, FileText, PenLine, RefreshCw, ScrollText, XCircle } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/primitives";
import { ARCHIVE_SORT_LABEL, REQUEST_STATUS, TONE_CLASSES } from "@/lib/domain";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage, useListArchiveQuery, useListAreasQuery } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store";
import { activeArchiveFilterCount, archiveActions } from "@/store/archive-slice";

import { QueryErrorState } from "./feedback";
import { useNow } from "./now-context";
import {
  ClearFiltersButton,
  FacetMenu,
  PageHeader,
  Pager,
  ResultLabel,
  SearchBox,
  SortMenu,
  StatCard,
  StatStrip,
  TD_CLASS,
  TH_CLASS,
  TableEmpty,
  TableFrame,
  TableSkeleton,
  Toolbar,
  ToolbarRow,
} from "./page-kit";

/**
 * Arsip Surat.
 *
 * The letters that have left the worklist: signed, collected, or rejected. This
 * is the desk an officer visits when a citizen comes back three months later
 * asking for a copy, so the verification code and the certificate serial are
 * shown inline — they are the two things the counter actually needs.
 */
const ARCHIVED_STATUSES = ["DITANDATANGANI", "SIAP_DIAMBIL", "SELESAI", "DITOLAK"] as const;

export function ArchiveWorkspace() {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((state) => state.archive);
  const filterCount = useAppSelector((state) => activeArchiveFilterCount(state.archive));
  const searchRef = React.useRef<HTMLInputElement>(null);
  const now = useNow();

  const queryArgs = React.useMemo(
    () => ({
      q: filters.q,
      status: filters.statuses,
      dusun: filters.dusun,
      sort: "submitted_desc" as const,
      page: filters.page,
      pageSize: filters.pageSize,
    }),
    [filters.q, filters.statuses, filters.dusun, filters.page, filters.pageSize],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useListArchiveQuery(queryArgs);
  const areas = useListAreasQuery();

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

  const resultLabel = data
    ? data.total === 0
      ? "Tidak ada surat yang cocok"
      : `${formatNumber(data.total)} surat · halaman ${data.page} dari ${data.totalPages}`
    : "";

  if (isError) {
    return (
      <>
        <PageHeader eyebrow="Sistem" icon={Archive} title="Arsip Surat" />
        <QueryErrorState
          title="Gagal memuat arsip surat"
          message={errorMessage(error)}
          onRetry={() => refetch()}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Sistem · Arsip Administrasi"
        icon={ScrollText}
        title="Arsip Surat Desa"
        description="Surat yang sudah ditandatangani, diserahkan, atau ditolak. Pencarian mencakup kode verifikasi QR sehingga permintaan salinan dari warga dapat dilayani langsung di loket."
        meta={
          <span className="tnum text-2xs text-fg-subtle">
            {formatNumber(data?.total ?? 0)} surat dalam arsip
          </span>
        }
      />

      <StatStrip>
        <StatCard
          label="Total arsip"
          value={formatNumber(data?.total ?? 0)}
          unit="surat"
          hint="Seluruh surat yang telah keluar dari antrean kerja"
          icon={Archive}
        />
        <StatCard
          label="Ditandatangani"
          value={formatNumber(data?.signedTotal ?? 0)}
          unit="surat"
          hint="Tanda tangan elektronik dengan sertifikat BSrE"
          tone="approved"
          icon={PenLine}
        />
        <StatCard
          label="Siap diambil"
          value={formatNumber(data?.statusCounts.SIAP_DIAMBIL ?? 0)}
          unit="surat"
          hint="Tercetak dan menunggu pemohon di loket"
          tone="progress"
          icon={FileText}
        />
        <StatCard
          label="Ditolak"
          value={formatNumber(data?.statusCounts.DITOLAK ?? 0)}
          unit="surat"
          hint="Penolakan permanen beserta alasan tertulis"
          tone={(() => (data?.statusCounts.DITOLAK ?? 0) > 0)() ? "rejected" : "neutral"}
          icon={XCircle}
        />
      </StatStrip>

      <Panel className="min-w-0">
        <PanelHeader
          title="Register Arsip"
          description="Urut dari yang paling baru diselesaikan."
          icon={Archive}
          action={
            <>
              <ResultLabel>{resultLabel}</ResultLabel>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                aria-label="Muat ulang arsip surat"
              >
                <RefreshCw className={cn(isFetching && "animate-spin")} aria-hidden />
                Segarkan
              </Button>
            </>
          }
        />

        <Toolbar>
          <ToolbarRow>
            <SearchBox
              value={filters.q}
              inputRef={searchRef}
              onChange={(value) => dispatch(archiveActions.searchChanged(value))}
              placeholder="Cari nama pemohon, nomor tiket, kode verifikasi, atau jenis surat…"
              label="Cari arsip surat"
            />

            <FacetMenu
              label="Status"
              selected={filters.statuses}
              onToggle={(value) => dispatch(archiveActions.statusToggled(value as never))}
              options={ARCHIVED_STATUSES.map((status) => ({
                value: status,
                label: REQUEST_STATUS[status].label,
                count: data?.statusCounts[status] ?? 0,
              }))}
            />

            <FacetMenu
              label="Dusun"
              selected={filters.dusun}
              onToggle={(value) => dispatch(archiveActions.dusunToggled(value))}
              options={(areas.data?.hamlets ?? []).map((hamlet) => ({
                value: hamlet.code,
                label: hamlet.name.split(" - ")[0],
              }))}
            />

            <SortMenu
              value="submitted_desc"
              options={ARCHIVE_SORT_LABEL}
              onChange={() => undefined}
              label="Urutan arsip"
            />

            <ClearFiltersButton
              count={filterCount}
              onClick={() => dispatch(archiveActions.filtersCleared())}
            />
          </ToolbarRow>
        </Toolbar>

        <TableFrame
          caption="Arsip surat desa"
          minWidthClass="min-w-[1080px]"
          busy={isLoading}
        >
          <thead>
            <tr>
              <th scope="col" className={cn(TH_CLASS, "w-[180px]")}>Tiket</th>
              <th scope="col" className={cn(TH_CLASS, "w-[190px]")}>Pemohon</th>
              <th scope="col" className={cn(TH_CLASS, "w-[230px]")}>Jenis Surat</th>
              <th scope="col" className={cn(TH_CLASS, "w-[140px]")}>Status</th>
              <th scope="col" className={cn(TH_CLASS, "w-[180px]")}>Kode Verifikasi</th>
              <th scope="col" className={cn(TH_CLASS, "w-[170px]")}>Selesai</th>
            </tr>
          </thead>

          {isLoading ? (
            <TableSkeleton
              columns={[
                { key: "a", width: "w-20" },
                { key: "b", width: "w-28" },
                { key: "c", width: "w-36" },
                { key: "d", width: "w-24" },
                { key: "e", width: "w-24" },
                { key: "f", width: "w-20" },
              ]}
              label="Memuat arsip surat…"
            />
          ) : (data?.rows.length ?? 0) === 0 ? (
            <tbody>
              <TableEmpty
                colSpan={6}
                title="Tidak ada surat pada arsip"
                message="Surat masuk ke arsip setelah ditandatangani, diserahkan ke warga, atau ditolak."
              />
            </tbody>
          ) : (
            <tbody>
              {data?.rows.map((row) => {
                const meta = REQUEST_STATUS[row.status as keyof typeof REQUEST_STATUS] ?? {
                  label: row.status,
                  tone: "neutral" as const,
                };
                return (
                  <tr key={row.id} className="h-9 border-b border-line transition-colors hover:bg-surface-muted">
                    <td className={TD_CLASS}>
                      <div className="flex flex-col justify-center gap-0.5 leading-4">
                        <span className="font-mono text-xs font-semibold tabular-nums tracking-tight text-fg">
                          {row.ticket}
                        </span>
                        <span className="tnum text-[10px] text-fg-subtle">
                          {row.agendaNumber ? `Agenda #${row.agendaNumber}` : "Tanpa nomor agenda"}
                        </span>
                      </div>
                    </td>
                    <td className={TD_CLASS}>
                      <div className="flex min-w-0 flex-col justify-center gap-0.5 leading-4">
                        <span className="truncate text-xs text-fg" title={row.applicantName}>
                          {row.applicantName}
                        </span>
                        <span className="truncate text-[10px] text-fg-subtle">
                          {row.dusun} · RT {String(row.rt).padStart(2, "0")}/RW{" "}
                          {String(row.rw).padStart(2, "0")}
                        </span>
                      </div>
                    </td>
                    <td className={TD_CLASS}>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="civic" size="sm" mono>
                          {row.letterCode}
                        </Badge>
                        <span className="truncate text-xs text-fg-muted" title={row.letterName}>
                          {row.letterName}
                        </span>
                      </div>
                    </td>
                    <td className={TD_CLASS}>
                      <Badge variant="outline" size="sm" className={cn(TONE_CLASSES[meta.tone].chip)}>
                        {meta.label}
                      </Badge>
                    </td>
                    <td className={TD_CLASS}>
                      <div className="flex flex-col justify-center gap-0.5 leading-4">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-fg">
                          {row.verificationCode}
                        </span>
                        <span className="truncate text-[10px] text-fg-subtle">
                          {row.certificateSerial
                            ? `Sertifikat ${row.certificateSerial}`
                            : "Tanpa sertifikat digital"}
                        </span>
                      </div>
                    </td>
                    <td className={TD_CLASS}>
                      <div className="flex flex-col justify-center gap-0.5 leading-4">
                        <span className="tnum text-xs text-fg">
                          {row.completedAt ? formatDate(row.completedAt) : "—"}
                        </span>
                        <span className="tnum text-[10px] text-fg-subtle">
                          {row.completedAt
                            ? formatRelative(row.completedAt, now)
                            : row.signedAt
                              ? `TTD ${formatRelative(row.signedAt, now)}`
                              : "Belum selesai"}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          )}
        </TableFrame>

        {data ? (
          <Pager
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            totalPages={data.totalPages}
            onPage={(page) => dispatch(archiveActions.pageChanged(page))}
            onPageSize={(size) => dispatch(archiveActions.pageSizeChanged(size))}
            noun="surat"
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-muted px-3.5 py-1.5">
          <p className="text-[10px] leading-4 text-fg-subtle">
            Retensi arsip surat desa mengikuti jadwal retensi arsip pemerintah desa. Dokumen tidak
            dapat dihapus, hanya ditandai kedaluwarsa.
          </p>
          <span className="tnum flex shrink-0 items-center gap-1 text-[10px] text-fg-subtle">
            <BadgeCheck className="size-3 text-approved" aria-hidden />
            {formatNumber(data?.signedTotal ?? 0)} surat bertanda tangan digital
          </span>
        </div>
      </Panel>
    </>
  );
}
