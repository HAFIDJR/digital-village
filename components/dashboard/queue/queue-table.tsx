"use client";

import {
  Check,
  CircleAlert,
  FileText,
  MapPin,
  MoreHorizontal,
  Paperclip,
  Printer,
  SearchX,
  ShieldCheck,
  X,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/primitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNik, formatNumber, formatRelative, formatSla } from "@/lib/format";
import { REQUEST_CHANNEL } from "@/lib/domain";
import { cn } from "@/lib/utils";
import type { QueueRow } from "@/db/queries";
import { letterPdfUrl, useVerifyRequestMutation } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store";
import { queueActions } from "@/store/queue-slice";
import {
  DocumentBadge,
  PriorityMarker,
  RequestStatusBadge,
  SlaIndicator,
} from "../status-badge";
import { toastFromMutation } from "../feedback";

/**
 * Antrean Pengajuan Surat Warga.
 *
 * Table notes for reviewers:
 *  - `table-fixed` + explicit column widths. In a 14-column worklist, auto layout
 *    re-flows the whole grid every time a document badge changes width, which
 *    makes the table feel alive under the cursor. Fixed widths stop that.
 *  - The ID column is monospace/tabular: officers read ticket numbers aloud and
 *    copy them into the physical register book.
 *  - Rows are activated with Enter/Space or a click, opening the review drawer.
 *    The action buttons stop propagation so a click on "Setujui" never also
 *    opens the drawer.
 */

/**
 * Column widths, shared by the header, the rows and the loading skeleton so the
 * three can never drift apart. The ID column is sized for the longest ticket
 * plus its SLA suffix on one line ("SRT-1013 · 19 jam lagi") — wrapping there was
 * the first thing to break once the navigation rail took its share of the width.
 */
const COLUMNS = [
  { key: "id", label: "ID & Waktu", width: "w-[186px]", align: "left" },
  { key: "applicant", label: "Nama Pemohon & NIK", width: "w-[196px]", align: "left" },
  { key: "type", label: "Jenis Surat", width: "w-[196px]", align: "left" },
  { key: "region", label: "Dusun / RT / RW", width: "w-[124px]", align: "left" },
  { key: "docs", label: "Kelengkapan Berkas", width: "w-[148px]", align: "left" },
  { key: "status", label: "Status", width: "w-[164px]", align: "left" },
  { key: "actions", label: "Tindakan", width: "w-[148px]", align: "right" },
] as const;

export function QueueTable({
  rows,
  loading,
  now,
  focusRowIndex,
}: {
  rows: QueueRow[];
  loading: boolean;
  now: number;
  focusRowIndex: number;
}) {
  if (loading) return <QueueTableSkeleton />;
  if (rows.length === 0) return <EmptyState />;

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full min-w-[1162px] table-fixed border-collapse"
        aria-label="Antrean pengajuan surat warga"
        aria-rowcount={rows.length}
      >
        <thead>
          <tr className="border-b border-line bg-surface-muted">
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "sticky top-0 z-10 h-8 whitespace-nowrap border-b border-line bg-surface-muted px-3",
                  "text-2xs font-semibold uppercase tracking-[0.045em] text-fg-subtle",
                  column.width,
                  column.align === "right" && "text-right",
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <QueueTableRow
              key={row.id}
              row={row}
              index={index}
              now={now}
              isFocused={index === focusRowIndex}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Strips the boilerplate every letter type shares. */
function shortLetterName(name: string) {
  return name.replace(/^Surat\s+Keterangan\s+/i, "").replace(/^Surat\s+/i, "");
}

/* -------------------------------------------------------------------------- */

const QueueTableRow = React.memo(function QueueTableRow({
  row,
  index,
  now,
  isFocused,
}: {
  row: QueueRow;
  index: number;
  now: number;
  isFocused: boolean;
}) {
  const dispatch = useAppDispatch();
  const density = useAppSelector((state) => state.queue.density);
  const selectedId = useAppSelector((state) => state.queue.selectedRequestId);
  const [verify, verifyState] = useVerifyRequestMutation();

  const isSelected = selectedId === row.id;
  const sla = formatSla(row.dueAt, now);
  const isOpen = ["PENDING_VERIFIKASI", "BERKAS_TIDAK_LENGKAP", "DIVERIFIKASI", "MENUNGGU_TTD_KADES"].includes(
    row.status,
  );

  const openDrawer = React.useCallback(() => {
    dispatch(queueActions.requestSelected(row.id));
    dispatch(queueActions.focusedIndexChanged(index));
  }, [dispatch, index, row.id]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDrawer();
    }
  };

  /**
   * "Setujui" is one button but two desks: from Pending Verifikasi it attests the
   * file is complete, from Diverifikasi it forwards the request for the Kepala
   * Desa's e-signature. The command resolves which, and the toast reports it.
   */
  const approve = async () => {
    const result = await verify({ id: row.id, body: { action: "setujui", expedite: false } }).unwrap();
    toastFromMutation(dispatch, {
      tone: "success",
      title:
        result.status === "MENUNGGU_TTD_KADES"
          ? `${result.ticket} diteruskan ke tanda tangan`
          : `${result.ticket} dinyatakan lengkap`,
      body:
        result.status === "MENUNGGU_TTD_KADES"
          ? `${result.letterTypeName} atas nama ${row.applicantName} kini menunggu TTD Kepala Desa.`
          : `Berkas ${result.letterTypeName} atas nama ${row.applicantName} lolos verifikasi kelengkapan.`,
    });
  };

  const reject = async () => {
    await verify({
      id: row.id,
      body: {
        action: "minta_perbaikan",
        note: row.complianceNote ?? "Berkas belum memenuhi syarat, mohon dilengkapi.",
        expedite: false,
      },
    }).unwrap();
    toastFromMutation(dispatch, {
      tone: "warning",
      title: `${row.ticket} dikembalikan untuk perbaikan`,
      body: "Pemohon menerima notifikasi untuk mengunggah ulang berkas.",
    });
  };

  return (
    <tr
      tabIndex={0}
      role="button"
      aria-label={`${row.ticket}. ${row.applicantName}. ${row.letterName}. ${row.dusun} RT ${row.rt}/RW ${row.rw}. Klik untuk meninjau berkas.`}
      aria-expanded={isSelected}
      onKeyDown={onKeyDown}
      onClick={openDrawer}
      className={cn(
        "group border-b border-line transition-colors",
        density === "compact" ? "h-9" : "h-12",
        "cursor-pointer",
        isSelected ? "bg-civic-soft hover:bg-civic-soft-hover" : "hover:bg-surface-muted",
        isFocused && !isSelected && "bg-surface-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-civic/60",
      )}
    >
      {/* --- 1. ID & waktu ------------------------------------------------ */}
      <td className="px-3 align-middle">
        <div className="flex flex-col justify-center gap-0.5">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="font-mono text-xs font-semibold tabular-nums tracking-tight text-fg">
              {row.ticket}
            </span>
            <PriorityMarker priority={row.priority} />
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap text-2xs leading-4 text-fg-subtle">
            <span
              className="tnum"
              title={`Diajukan ${formatRelative(row.submittedAt, now)}`}
            >
              {formatRelative(row.submittedAt, now, true)}
            </span>
            <span aria-hidden className="text-line-strong">
              ·
            </span>
            <SlaIndicator slaMinutes={row.slaMinutes} label={sla.label} tone={sla.tone} />
          </span>
        </div>
      </td>

      {/* --- 2. Nama pemohon & NIK ---------------------------------------- */}
      <td className="min-w-0 px-3 align-middle">
        <div className="flex min-w-0 flex-col justify-center gap-0.5">
          <span className="truncate text-xs font-medium leading-4 text-fg" title={row.applicantName}>
            {row.applicantName}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="truncate font-mono text-2xs tabular-nums leading-4 text-fg-subtle"
              title={`NIK ${row.applicantNik}`}
            >
              {formatNik(row.applicantNik)}
            </span>
            <span className="sr-only">NIK {row.applicantNik}</span>
            {row.channel ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="shrink-0 rounded-xs border border-line bg-surface-muted px-1 text-[10px] font-medium text-fg-subtle">
                    {row.channel === "LOKET" ? "LOK" : row.channel === "WHATSAPP" ? "WA" : "WEB"}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Diajukan melalui {REQUEST_CHANNEL[row.channel] ?? row.channel}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </span>
        </div>
      </td>

      {/* --- 3. Jenis surat ------------------------------------------------ */}
      <td className="min-w-0 px-3 align-middle">
        <div className="flex min-w-0 items-center gap-2">
          <Badge
            variant="civic"
            size="sm"
            mono
            className="min-w-[3rem] shrink-0 justify-center text-[10px] font-bold"
            title={row.letterName}
          >
            {row.letterCode}
          </Badge>
          {/*
            Every type in this village starts with "Surat Keterangan", so the
            distinctive part is what follows it. Showing the tail keeps the
            column readable at a glance instead of truncating six rows to the
            same eleven characters; the full name stays available on hover and
            to screen readers.
          */}
          <span className="truncate text-xs leading-4 text-fg-muted" title={row.letterName}>
            <span aria-hidden>{shortLetterName(row.letterName)}</span>
            <span className="sr-only">{row.letterName}</span>
          </span>
        </div>
      </td>

      {/* --- 4. Dusun / RT / RW ------------------------------------------- */}
      <td className="px-3 align-middle">
        <div className="flex items-center gap-1.5">
          <MapPin className="size-3 shrink-0 text-fg-subtle" aria-hidden />
          <div className="flex min-w-0 flex-col leading-4">
            <span className="truncate text-xs text-fg">{row.dusun}</span>
            <span className="tnum font-mono text-2xs text-fg-subtle">
              RT {String(row.rt).padStart(2, "0")}/RW {String(row.rw).padStart(2, "0")}
            </span>
          </div>
        </div>
      </td>

      {/* --- 5. Kelengkapan berkas ---------------------------------------- */}
      <td className="px-3 align-middle">
        <DocumentBadge
          uploaded={row.documentsUploaded}
          required={row.documentsRequired}
          complianceNote={row.complianceNote}
          className="max-w-full"
        />
      </td>

      {/* --- 6. Status ---------------------------------------------------- */}
      <td className="px-3 align-middle">
        <div className="flex flex-col items-start gap-0.5">
          <RequestStatusBadge status={row.status} />
          {row.assignedTo ? (
            <span className="truncate text-2xs leading-4 text-fg-subtle" title={row.assignedTo}>
              Petugas: {row.assignedTo.replace(/,.*$/, "")}
            </span>
          ) : (
            <span className="text-2xs leading-4 text-fg-subtle">Belum ditugaskan</span>
          )}
        </div>
      </td>

      {/* --- 7. Aksi ------------------------------------------------------ */}
      <td className="px-3 align-middle">
        <div
          className="flex items-center justify-end gap-1"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          role="presentation"
        >
          <Button
            variant="secondary"
            size="xs"
            onClick={openDrawer}
            aria-label={`Tinjau berkas ${row.ticket}`}
          >
            <Paperclip aria-hidden />
            <span className="hidden sm:inline">Tinjau Berkas</span>
            <span className="sm:hidden">Tinjau</span>
          </Button>

          {isOpen ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="success"
                  size="icon-xs"
                  disabled={verifyState.isLoading}
                  onClick={approve}
                  aria-label={`Setujui ${row.ticket} dan teruskan ke tanda tangan`}
                >
                  <Check aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Setujui &amp; teruskan</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  asChild
                  aria-label={`Buka berkas arsip ${row.ticket}`}
                >
                  <a href={letterPdfUrl(row.id, "draft", 1)} target="_blank" rel="noreferrer">
                    <Printer aria-hidden />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Cetak ulang draf</TooltipContent>
            </Tooltip>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`Tindakan lain untuk ${row.ticket}`}>
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[15rem]">
              <DropdownMenuLabel>{row.ticket}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={openDrawer}>
                <FileText aria-hidden />
                Tinjau berkas lengkap
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={letterPdfUrl(row.id, "draft", 1)} target="_blank" rel="noreferrer">
                  <Printer aria-hidden />
                  Cetak draf surat (PDF)
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={letterPdfUrl(row.id, "final", 2)} target="_blank" rel="noreferrer">
                  <ShieldCheck aria-hidden />
                  Cetak final + arsip (2 lembar)
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isOpen ? (
                <>
                  <DropdownMenuItem tone="success" onSelect={approve}>
                    <Check aria-hidden />
                    Setujui berkas
                  </DropdownMenuItem>
                  <DropdownMenuItem tone="danger" onSelect={reject}>
                    <X aria-hidden />
                    Minta perbaikan berkas
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem disabled>Berkas sudah selesai diproses</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );
});

/* -------------------------------------------------------------------------- */

function EmptyState() {
  const dispatch = useAppDispatch();

  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="grid size-10 place-items-center rounded-full border border-line bg-surface-muted">
        <SearchX className="size-4 text-fg-subtle" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="font-display text-[13px] font-semibold text-fg">
          Tidak ada pengajuan yang cocok
        </p>
        <p className="max-w-sm text-2xs leading-4 text-fg-subtle">
          Saringan yang aktif tidak menemukan berkas apa pun. Coba longgarkan filter atau bersihkan
          seluruh saringan untuk melihat semua antrean.
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={() => dispatch(queueActions.filtersCleared())}>
        <X aria-hidden />
        Bersihkan semua saringan
      </Button>
    </div>
  );
}

function QueueTableSkeleton() {
  return (
    <div className="overflow-hidden" aria-busy="true" aria-live="polite">
      <span className="sr-only">Memuat antrean pengajuan…</span>
      <div className="flex h-8 items-center gap-3 border-b border-line bg-surface-muted px-3">
        {COLUMNS.map((column) => (
          <Skeleton key={column.key} className={cn("h-2.5", column.width)} />
        ))}
      </div>
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex h-11 items-center gap-3 border-b border-line px-3">
          <div className="w-[186px] space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-2.5 w-20" />
          </div>
          <div className="w-[196px] space-y-1.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-40" />
          </div>
          <div className="w-[196px]">
            <Skeleton className="h-5 w-36 rounded-full" />
          </div>
          <div className="w-[124px] space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </div>
          <div className="w-[148px]">
            <Skeleton className="h-5 w-32 rounded-full" />
          </div>
          <div className="w-[164px] space-y-1.5">
            <Skeleton className="h-5 w-36 rounded-full" />
            <Skeleton className="h-2.5 w-24" />
          </div>
          <div className="ml-auto flex w-[148px] justify-end gap-1.5">
            <Skeleton className="h-6 w-14" />
            <Skeleton className="size-6" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Compact "how many are late" strip above the table. */
export function QueueAlertStrip({
  overdueTotal,
  unprocessedTotal,
  total,
}: {
  overdueTotal: number;
  unprocessedTotal: number;
  total: number;
}) {
  if (overdueTotal === 0 && unprocessedTotal === 0) {
    return (
      <div className="flex items-center gap-2 border-b border-line bg-approved-bg/60 px-3.5 py-1.5">
        <ShieldCheck className="size-3.5 shrink-0 text-approved" aria-hidden />
        <p className="text-2xs text-approved">
          Seluruh {formatNumber(total)} pengajuan berada dalam batas waktu pelayanan.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3.5 py-1.5",
        overdueTotal > 0 ? "border-rejected-line/40 bg-rejected-bg/60" : "border-pending-line/40 bg-pending-bg/60",
      )}
      role="status"
    >
      <span className="flex items-center gap-1.5">
        <CircleAlert
          className={cn("size-3.5 shrink-0", overdueTotal > 0 ? "text-rejected" : "text-pending")}
          aria-hidden
        />
        <span className={cn("text-2xs", overdueTotal > 0 ? "text-rejected" : "text-pending")}>
          {overdueTotal > 0 ? (
            <>
              <span className="tnum font-semibold">{formatNumber(overdueTotal)}</span> berkas melewati
              batas waktu pelayanan (SLA) dan perlu ditindaklanjuti hari ini.
            </>
          ) : (
            <>
              <span className="tnum font-semibold">{formatNumber(unprocessedTotal)}</span> berkas
              menunggu verifikasi awal petugas loket.
            </>
          )}
        </span>
      </span>
      <span className="tnum ml-auto text-2xs text-fg-subtle">
        Total pengajuan pada daftar:{" "}
        <span className="font-semibold text-fg-muted">{formatNumber(total)}</span>
      </span>
    </div>
  );
}

export { EmptyState };
