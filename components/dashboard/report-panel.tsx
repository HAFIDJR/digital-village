"use client";

import { MapPin, Megaphone, MessageSquare, UserCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader, Skeleton } from "@/components/ui/primitives";
import { REPORT_CATEGORY, REPORT_STATUS, TONE_CLASSES } from "@/lib/domain";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReportEntry } from "@/db/queries";

import { useNow } from "./now-context";

/**
 * Citizen reports and aspirations.
 *
 * Kept as a distinct panel rather than folded into the letter queue: the two
 * worklists have different owners (Kasi Pelayanan owns letters, Kaur TU and the
 * Kadus own reports) and different SLAs, so merging them would create a list
 * nobody is accountable for.
 *
 * Reports are ordered by state, then recency — new first, resolved last.
 */
export function ReportPanel({
  reports,
  loading,
}: {
  reports: ReportEntry[];
  loading: boolean;
}) {
  const now = useNow();
  const newCount = reports.filter((r) => r.status === "NEW").length;
  const inProgress = reports.filter((r) => r.status === "IN_PROGRESS").length;

  return (
    <Panel>
      <PanelHeader
        title="Laporan & Aspirasi Warga"
        description="Aduan infrastruktur, kebersihan, keamanan, dan layanan publik dari kanal website dan WhatsApp."
        icon={Megaphone}
        action={
          <div className="flex items-center gap-1.5">
            <Badge variant="pending" size="sm">
              {newCount} Baru
            </Badge>
            <Badge variant="progress" size="sm">
              {inProgress} Sedang Dikerjakan
            </Badge>
          </div>
        }
      />

      {loading ? (
        <div className="divide-y divide-line" aria-busy="true" aria-live="polite">
          <span className="sr-only">Memuat laporan warga…</span>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2 px-3.5 py-3">
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <p className="px-6 py-8 text-center text-2xs text-fg-subtle">
          Belum ada laporan warga yang masuk pada periode ini.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {reports.map((report) => {
            const statusMeta = REPORT_STATUS[report.status] ?? {
              label: report.status,
              tone: "neutral" as const,
            };

            return (
              <li
                key={report.id}
                className="flex flex-col gap-2 px-3.5 py-3 transition-colors hover:bg-surface-muted sm:flex-row sm:items-start sm:gap-4"
              >
                {/* --- identity column ---------------------------------- */}
                <div className="flex shrink-0 items-center gap-2 sm:w-32 sm:flex-col sm:items-start sm:gap-1">
                  <span className="font-mono text-2xs font-semibold tabular-nums text-fg">
                    {report.ticket}
                  </span>
                  <span className="tnum text-[10px] text-fg-subtle">
                    {formatRelative(report.submittedAt, now)}
                  </span>
                  <Badge
                    variant="outline"
                    size="sm"
                    className={cn("sm:mt-0.5", TONE_CLASSES[statusMeta.tone].chip)}
                  >
                    {statusMeta.label}
                  </Badge>
                </div>

                {/* --- content ----------------------------------------- */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="neutral" size="sm">
                      {REPORT_CATEGORY[report.category] ?? report.category}
                    </Badge>
                    {report.priority === "PRIORITAS" || report.priority === "DARURAT" ? (
                      <Badge
                        variant={report.priority === "DARURAT" ? "rejected" : "pending"}
                        size="sm"
                      >
                        {report.priority === "DARURAT" ? "Darurat" : "Prioritas"}
                      </Badge>
                    ) : null}
                    {report.dusun ? (
                      <span className="tnum flex items-center gap-0.5 text-[10px] text-fg-subtle">
                        <MapPin className="size-2.5" aria-hidden />
                        {report.dusun}
                        {report.rt ? ` RT ${String(report.rt).padStart(2, "0")}/RW ${String(report.rw).padStart(2, "0")}` : ""}
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-1 text-xs font-medium leading-4 text-fg">{report.subject}</p>
                  <p className="mt-1 line-clamp-2 text-2xs leading-4 text-fg-muted">{report.body}</p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-fg-subtle">
                    <span className="flex items-center gap-1">
                      <UserCheck className="size-2.5" aria-hidden />
                      Pelapor: {report.reporterName}
                    </span>
                    {report.handledByName ? (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="size-2.5" aria-hidden />
                        Ditangani: {report.handledByName.replace(/,.*$/, "")}
                        {report.responseCount > 0 ? ` · ${report.responseCount} tanggapan` : ""}
                      </span>
                    ) : (
                      <span className="font-medium text-pending">Belum ditugaskan ke petugas</span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-muted px-3.5 py-1.5">
        <p className="text-[10px] text-fg-subtle">
          Laporan warga wajib ditanggapi paling lambat 5 hari kerja sesuai Perdes Pelayanan Publik.
        </p>
        <span className="tnum text-[10px] text-fg-subtle">{reports.length} laporan terakhir</span>
      </div>
    </Panel>
  );
}
