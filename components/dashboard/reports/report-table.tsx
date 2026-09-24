"use client";

import { MapPin, MessageSquare, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { REPORT_CATEGORY, REPORT_STATUS, PRIORITY, TONE_CLASSES } from "@/lib/domain";
import { formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReportRow } from "@/db/queries";

import { useNow } from "../now-context";
import { TD_CLASS, TH_CLASS, TableEmpty, TableFrame, TableSkeleton } from "../page-kit";

/**
 * Citizen reports register.
 *
 * The same table renders the landing summary and the full /laporan register —
 * an officer who clicks through from the dashboard must not have to re-learn
 * the columns. Row height is compact (36px) because this list is read, not
 * annotated: the officer scans for the new and the unanswered ones.
 */

const COLUMNS = [
  { key: "ticket", label: "Tiket & Waktu", width: "w-[184px]" },
  { key: "reporter", label: "Pelapor", width: "w-[190px]" },
  { key: "subject", label: "Laporan & Kategori", width: "w-[300px]" },
  { key: "area", label: "Dusun / RT / RW", width: "w-[150px]" },
  { key: "status", label: "Status", width: "w-[188px]" },
  { key: "handling", label: "Penanganan", width: "w-[196px]" },
] as const;

export function ReportTable({
  rows,
  loading,
  onSelect,
  selectedId,
  emptyTitle = "Belum ada laporan warga",
  emptyMessage = "Laporan yang masuk dari website desa dan kanal WhatsApp warga akan muncul di sini.",
}: {
  rows: ReportRow[];
  loading: boolean;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  emptyTitle?: string;
  emptyMessage?: string;
}) {
  const now = useNow();

  return (
    <TableFrame caption="Laporan dan aspirasi warga" minWidthClass="min-w-[1108px]" busy={loading}>
      <thead>
        <tr>
          {COLUMNS.map((column) => (
            <th key={column.key} scope="col" className={cn(TH_CLASS, column.width)}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>

      {loading ? (
        <TableSkeleton
          columns={COLUMNS.map((column) => ({ key: column.key, width: column.width }))}
          label="Memuat laporan warga…"
        />
      ) : rows.length === 0 ? (
        <tbody>
          <TableEmpty colSpan={COLUMNS.length} title={emptyTitle} message={emptyMessage} />
        </tbody>
      ) : (
        <tbody>
          {rows.map((row) => {
            const statusMeta = REPORT_STATUS[row.status] ?? {
              label: row.status,
              tone: "neutral" as const,
            };
            const priority = PRIORITY[row.priority];
            const isSelected = selectedId === row.id;

            return (
              <tr
                key={row.id}
                {...(onSelect
                  ? {
                      tabIndex: 0,
                      role: "button" as const,
                      "aria-label": `${row.ticket}. ${row.subject}. Klik untuk membuka detail laporan.`,
                      onClick: () => onSelect(row.id),
                      onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onSelect(row.id);
                        }
                      },
                    }
                  : {})}
                className={cn(
                  "h-9 border-b border-line transition-colors",
                  onSelect && "group cursor-pointer",
                  isSelected ? "bg-civic-soft" : onSelect && "hover:bg-surface-muted",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-civic/60",
                )}
              >
                {/* --- ticket & age ------------------------------------------ */}
                <td className={TD_CLASS}>
                  <div className="flex flex-col justify-center gap-0.5 leading-4">
                    <span className="font-mono text-xs font-semibold tabular-nums tracking-tight text-fg">
                      {row.ticket}
                    </span>
                    <span className="tnum text-[10px] text-fg-subtle">
                      {formatRelative(row.submittedAt, now)}
                      {row.openDays >= 1 ? ` · ${row.openDays} hari terbuka` : ""}
                    </span>
                  </div>
                </td>

                {/* --- reporter ---------------------------------------------- */}
                <td className={TD_CLASS}>
                  <div className="flex min-w-0 flex-col justify-center gap-0.5 leading-4">
                    <span className="truncate text-xs font-medium text-fg" title={row.reporterName}>
                      {row.reporterName}
                    </span>
                    <span className="truncate font-mono text-[10px] tabular-nums text-fg-subtle">
                      {row.reporterNik.slice(0, 8)}xxxx
                      {row.reporterPhone ? ` · ${row.reporterPhone}` : ""}
                    </span>
                  </div>
                </td>

                {/* --- subject & category ------------------------------------ */}
                <td className={TD_CLASS}>
                  <div className="flex min-w-0 flex-col justify-center gap-0.5 leading-4">
                    <span className="flex items-center gap-1.5">
                      <Badge variant="neutral" size="sm">
                        {REPORT_CATEGORY[row.category] ?? row.category}
                      </Badge>
                      {row.priority !== "NORMAL" && priority ? (
                        <Badge
                          variant={row.priority === "DARURAT" ? "rejected" : "pending"}
                          size="sm"
                        >
                          {priority.label}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="truncate text-xs text-fg-muted" title={row.subject}>
                      {row.subject}
                    </span>
                  </div>
                </td>

                {/* --- area -------------------------------------------------- */}
                <td className={TD_CLASS}>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="size-3 shrink-0 text-fg-subtle" aria-hidden />
                    <div className="flex min-w-0 flex-col leading-4">
                      <span className="truncate text-xs text-fg">{row.dusun ?? "—"}</span>
                      <span className="tnum font-mono text-[10px] text-fg-subtle">
                        {row.rt !== null
                          ? `RT ${String(row.rt).padStart(2, "0")}/RW ${String(row.rw).padStart(2, "0")}`
                          : "Tanpa wilayah"}
                      </span>
                    </div>
                  </div>
                </td>

                {/* --- status ------------------------------------------------ */}
                <td className={TD_CLASS}>
                  <div className="flex flex-col items-start gap-0.5 leading-4">
                    <Badge
                      variant="outline"
                      size="sm"
                      className={cn(TONE_CLASSES[statusMeta.tone].chip)}
                    >
                      {statusMeta.label}
                    </Badge>
                    {row.resolvedAt ? (
                      <span className="tnum text-[10px] text-fg-subtle">
                        Selesai {formatRelative(row.resolvedAt, now)}
                      </span>
                    ) : null}
                  </div>
                </td>

                {/* --- handling ---------------------------------------------- */}
                <td className={TD_CLASS}>
                  <div className="flex flex-col justify-center gap-0.5 leading-4">
                    {row.handledByName ? (
                      <>
                        <span
                          className="flex items-center gap-1 truncate text-xs text-fg"
                          title={row.handledByName}
                        >
                          <UserCheck className="size-3 shrink-0 text-fg-subtle" aria-hidden />
                          {row.handledByName.replace(/,.*$/, "")}
                        </span>
                        <span className="tnum text-[10px] text-fg-subtle">
                          {row.responseCount > 0
                            ? `${formatNumber(row.responseCount)} tanggapan`
                            : "Belum ada tanggapan"}
                        </span>
                      </>
                    ) : (
                      <span className="flex items-center gap-1 text-2xs font-medium text-pending">
                        <MessageSquare className="size-3 shrink-0" aria-hidden />
                        Belum ditugaskan
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      )}
    </TableFrame>
  );
}
