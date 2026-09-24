"use client";

import { BarChart3, ClipboardList, Gauge, MapPin, Megaphone, Timer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/ui/primitives";
import { REPORT_CATEGORY, TONE_CLASSES } from "@/lib/domain";
import { formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReportPage } from "@/db/queries";

import { useNow } from "../now-context";

/**
 * Summary of the citizen-report stream.
 *
 * Everything here is derived from `listReports`' facets and summary block, so
 * the landing figures and the table beneath them can never disagree — both come
 * from one request, one filter set, one clock.
 *
 * The bars are plain divs sized by percentage rather than a chart library:
 * there is no zoom, no tooltip and no legend to justify the dependency, and a
 * CSS bar prints correctly on the paper reports the office still files.
 */
export function ReportSummaryPanel({
  data,
  loading,
  onCategorySelect,
  onStatusSelect,
  activeCategories,
  activeStatuses,
  layout = "stacked",
}: {
  data?: ReportPage;
  loading: boolean;
  onCategorySelect?: (category: string) => void;
  onStatusSelect?: (status: string) => void;
  activeCategories?: string[];
  activeStatuses?: string[];
  /** `split` puts the figures and the category spread side by side. */
  layout?: "stacked" | "split";
}) {
  const now = useNow();
  const summary = data?.summary;
  const categories = data?.categoryCounts ?? [];
  const maxCategory = Math.max(1, ...categories.map((entry) => entry.count));

  const statusBars = [
    { key: "NEW", label: "Baru", count: summary?.newCount ?? 0, tone: "pending" as const },
    {
      key: "IN_PROGRESS",
      label: "Dikerjakan",
      count: summary?.inProgress ?? 0,
      tone: "progress" as const,
    },
    {
      key: "RESOLVED",
      label: "Selesai",
      count: summary?.resolved ?? 0,
      tone: "approved" as const,
    },
    {
      key: "REJECTED",
      label: "Ditolak",
      count: summary?.rejected ?? 0,
      tone: "rejected" as const,
    },
  ];
  const maxStatus = Math.max(1, ...statusBars.map((bar) => bar.count));
  const handledShare = summary ? summary.total - summary.unanswered : 0;

  return (
    <div className={cn("grid gap-3.5", layout === "split" && "xl:grid-cols-2")}>
      {/* --- headline figures ------------------------------------------- */}
      <Panel>
        <PanelHeader
          title="Ringkasan Laporan"
          description="Rekap seluruh laporan yang masuk, terlepas dari saringan tabel."
          icon={Gauge}
          action={
            summary?.lastSubmittedAt ? (
              <span className="tnum text-2xs text-fg-subtle">
                Laporan terakhir {formatRelative(summary.lastSubmittedAt, now)}
              </span>
            ) : null
          }
        />

        {loading || !summary ? (
          <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 sm:divide-y-0" aria-busy>
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="px-3.5 py-3">
                <div className="skeleton-shimmer h-2.5 w-20 rounded-xs" />
                <div className="skeleton-shimmer mt-2 h-5 w-12 rounded-xs" />
              </div>
            ))}
          </div>
        ) : (
          <dl className="grid grid-cols-2 divide-line sm:grid-cols-4">
            {statusBars.map((bar) => (
              <div
                key={bar.key}
                className="border-b border-r border-line px-3.5 py-3 last:border-r-0 sm:border-b-0"
              >
                <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">
                  <span className={cn("size-1.5 rounded-full", TONE_CLASSES[bar.tone].dot)} aria-hidden />
                  {bar.label}
                </dt>
                <dd className="tnum mt-1.5 flex items-baseline gap-1">
                  <span
                    className={cn(
                      "font-display text-xl font-bold leading-none tracking-[-0.02em]",
                      bar.tone === "pending" ? TONE_CLASSES.pending.text : "text-fg",
                    )}
                  >
                    {formatNumber(bar.count)}
                  </span>
                  <span className="text-[10px] text-fg-subtle">
                    {summary.total > 0 ? `${Math.round((bar.count / summary.total) * 100)}%` : "0%"}
                  </span>
                </dd>
                {bar.key !== "REJECTED" ? (
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className={cn("h-full rounded-full", TONE_CLASSES[bar.tone].bar)}
                      style={{ width: `${Math.max(2, (bar.count / maxStatus) * 100)}%` }}
                      aria-hidden
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </dl>
        )}

        <div className="grid gap-x-6 gap-y-1.5 border-t border-line bg-surface-muted px-3.5 py-2 sm:grid-cols-2">
          <SummaryFact
            icon={Timer}
            label="Belum ditanggapi"
            value={`${formatNumber(summary?.unanswered ?? 0)} laporan`}
            hint="Wajib ditanggapi maksimal 5 hari kerja"
            tone={(summary?.unanswered ?? 0) > 0 ? "pending" : "neutral"}
          />
          <SummaryFact
            icon={ClipboardList}
            label="Rata-rata penyelesaian"
            value={summary?.avgResolveHours !== null && summary ? `${summary.avgResolveHours} jam` : "—"}
            hint="Dihitung dari laporan yang sudah selesai"
          />
          <SummaryFact
            icon={BarChart3}
            label="Masuk bulan ini"
            value={`${formatNumber(summary?.receivedThisMonth ?? 0)} laporan`}
            hint={`${formatNumber(summary?.resolvedThisMonth ?? 0)} selesai pada periode yang sama`}
          />
          <SummaryFact
            icon={Megaphone}
            label="Sudah ditangani petugas"
            value={`${formatNumber(handledShare)} dari ${formatNumber(summary?.total ?? 0)}`}
            hint="Sisanya masih menunggu penugasan"
            tone={handledShare > 0 ? "approved" : "neutral"}
          />
        </div>
      </Panel>

      {/* --- distribution ------------------------------------------------ */}
      <Panel>
        <PanelHeader
          title="Sebaran Kategori"
          description="Klik satu kategori untuk menyaring tabel laporan di halaman ini."
          icon={MapPin}
          action={
            <Badge variant="outline" size="sm">
              {formatNumber(categories.length)} kategori
            </Badge>
          }
        />
        {loading ? (
          <div className="space-y-2 px-3.5 py-3" aria-busy>
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="skeleton-shimmer h-6 w-full rounded-xs" />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-2xs text-fg-subtle">
            Belum ada laporan yang masuk pada periode ini.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {categories.map((entry) => {
              const active = activeCategories?.includes(entry.category) ?? false;
              return (
                <li key={entry.category}>
                  <button
                    type="button"
                    onClick={() => onCategorySelect?.(entry.category)}
                    aria-pressed={onCategorySelect ? active : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors",
                      onCategorySelect ? "hover:bg-surface-muted" : "cursor-default",
                      active && "bg-civic-soft",
                    )}
                  >
                    <span className="w-[7.5rem] shrink-0 truncate text-xs text-fg">
                      {REPORT_CATEGORY[entry.category] ?? entry.category}
                    </span>
                    <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-muted">
                      <span
                        className={cn("block h-full rounded-full", active ? "bg-civic" : "bg-slate-400")}
                        style={{ width: `${Math.max(3, (entry.count / maxCategory) * 100)}%` }}
                        aria-hidden
                      />
                    </span>
                    <span className="tnum w-8 shrink-0 text-right font-mono text-xs font-semibold text-fg">
                      {formatNumber(entry.count)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {activeStatuses && activeStatuses.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-surface-muted px-3.5 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">
              Saringan aktif
            </span>
            {activeStatuses.map((status) => (
              <Badge key={status} variant="civic" size="sm">
                {REPORT_CATEGORY[status] ?? statusLabel(status)}
              </Badge>
            ))}
            {onStatusSelect ? (
              <button
                type="button"
                onClick={() => activeStatuses.forEach((status) => onStatusSelect(status))}
                className="text-[10px] font-medium text-civic hover:underline"
              >
                Bersihkan
              </button>
            ) : null}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    NEW: "Baru",
    IN_PROGRESS: "Sedang Dikerjakan",
    RESOLVED: "Selesai",
    REJECTED: "Ditolak",
  };
  return map[status] ?? status;
}

function SummaryFact({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "pending" | "approved";
}) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      <Icon
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          tone === "pending"
            ? TONE_CLASSES.pending.text
            : tone === "approved"
              ? TONE_CLASSES.approved.text
              : "text-fg-subtle",
        )}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-[0.05em] text-fg-subtle">{label}</p>
        <p className="tnum text-xs font-semibold text-fg">{value}</p>
        <p className="text-[10px] leading-4 text-fg-subtle">{hint}</p>
      </div>
    </div>
  );
}
