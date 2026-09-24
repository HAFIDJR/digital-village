"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Inbox,
  Megaphone,
  Minus,
  PenLine,
  ShieldCheck,
  Users,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatClock, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { KpiSummary } from "@/db/queries";
import { useAppDispatch } from "@/store";
import { queueActions } from "@/store/queue-slice";
import { useNow } from "./now-context";

/**
 * Operational KPI row.
 *
 * Design decisions worth stating:
 *  - One flat row of four flush cards. No drop shadows, no gradients, no
 *    floating: each card is a white rectangle bounded by a 1px hairline, exactly
 *    like every other container in the system.
 *  - The card is a *button*, not decoration. Each one is a one-click filter
 *    preset into the worklist below — the number is only useful if you can act
 *    on it, which is the difference between a dashboard and a poster.
 *  - Every figure is tabular so the row does not reflow as counts tick.
 */
export function KpiRow({ kpi, loading }: { kpi?: KpiSummary; loading: boolean }) {
  if (loading || !kpi) return <KpiRowSkeleton />;

  const unprocessedShare =
    kpi.lettersToday > 0 ? (kpi.lettersTodayUnprocessed / kpi.lettersToday) * 100 : 0;

  return (
    <section
      aria-labelledby="ringkasan-operasional"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <h2 id="ringkasan-operasional" className="sr-only">
        Ringkasan operasional hari ini
      </h2>

      <KpiCard
        icon={Inbox}
        label="Surat Masuk Hari Ini"
        value={formatNumber(kpi.lettersToday)}
        unit="berkas"
        hrefDescription="Buka antrean pengajuan"
        onActivate={(dispatch) => {
          dispatch(queueActions.filtersCleared());
          dispatch(queueActions.slaChanged("today"));
        }}
        footer={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge
              variant={kpi.lettersTodayUnprocessed > 0 ? "pending" : "approved"}
              size="sm"
              className="shrink-0"
            >
              {formatNumber(kpi.lettersTodayUnprocessed)} Belum Diproses
            </Badge>
            <span className="tnum text-2xs text-fg-subtle">
              {formatNumber(kpi.lettersTodayProcessed)} selesai diperiksa
            </span>
          </span>
        }
        metric={
          <DeltaPill
            value={kpi.lettersTodayDelta}
            suffix="vs kemarin"
            invert
            context={`${formatNumber(Math.abs(kpi.lettersTodayDelta))} berkas ${
              kpi.lettersTodayDelta >= 0 ? "lebih banyak" : "lebih sedikit"
            } dari hari kerja sebelumnya`}
          />
        }
        progress={{ value: unprocessedShare, tone: kpi.lettersTodayUnprocessed > 0 ? "pending" : "approved" }}
        progressLabel={`${Math.round(unprocessedShare)}% berkas hari ini belum diproses`}
      />

      <KpiCard
        icon={Users}
        label="Total Penduduk Aktif"
        value={formatNumber(kpi.activeResidents)}
        unit="jiwa"
        hrefDescription="Buka data kependudukan"
        footer={
          <span className="tnum text-2xs text-fg-subtle">
            {formatNumber(kpi.activeFamilies)} Kartu Keluarga ·{" "}
            {formatNumber(kpi.males)} L / {formatNumber(kpi.females)} P
          </span>
        }
        metric={
          <DeltaPill
            value={kpi.residentsDelta30d}
            suffix="30 hari"
            context={`Bertambah ${formatNumber(kpi.residentsDelta30d)} jiwa dalam 30 hari terakhir dari kelahiran, pindah datang, dan mutasi kematian`}
          />
        }
      />

      <KpiCard
        icon={Megaphone}
        label="Laporan / Aspirasi Warga"
        value={formatNumber(kpi.reportsNew)}
        unit="baru"
        hrefDescription="Buka daftar laporan warga"
        footer={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge variant="progress" size="sm" className="shrink-0">
              {formatNumber(kpi.reportsInProgress)} Sedang Dikerjakan
            </Badge>
            <span className="tnum text-2xs text-fg-subtle">
              {formatNumber(kpi.reportsResolvedThisMonth)} tuntas bulan ini
            </span>
          </span>
        }
        metric={
          kpi.overdueCount > 0 ? (
            <button
              type="button"
              className="text-2xs font-medium text-rejected underline decoration-dotted underline-offset-2 hover:decoration-solid"
              // Deliberately not nested inside the card button; see KpiCard.
              onClick={(event) => event.stopPropagation()}
              tabIndex={-1}
              aria-hidden
            >
              {formatNumber(kpi.overdueCount)} berkas lewat SLA
            </button>
          ) : (
            <span className="text-2xs text-fg-subtle">Semua berkas dalam batas SLA</span>
          )
        }
      />

      <EsignCard kpi={kpi} />
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function KpiCard({
  icon: Icon,
  label,
  value,
  unit,
  metric,
  footer,
  progress,
  progressLabel,
  hrefDescription,
  onActivate,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  unit: string;
  metric?: React.ReactNode;
  footer: React.ReactNode;
  progress?: { value: number; tone: "pending" | "approved" };
  progressLabel?: string;
  hrefDescription: string;
  onActivate?: (dispatch: ReturnType<typeof useAppDispatch>) => void;
}) {
  const dispatch = useAppDispatch();
  const interactive = Boolean(onActivate);

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-sm border border-line bg-surface-muted text-fg-subtle">
            <Icon className="size-3.5" aria-hidden />
          </span>
          <h3 className="truncate text-2xs font-semibold uppercase tracking-[0.045em] text-fg-subtle">
            {label}
          </h3>
        </div>
        {interactive ? (
          <ArrowUpRight
            className="size-3.5 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            aria-hidden
          />
        ) : null}
      </div>

      <p className="mt-2.5 flex items-baseline gap-1.5">
        <span className="tnum font-display text-[26px] font-bold leading-none tracking-[-0.02em] text-fg">
          {value}
        </span>
        <span className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">{unit}</span>
      </p>

      {metric ? <div className="mt-1.5 min-h-4">{metric}</div> : <div className="mt-1.5 min-h-4" />}

      {progress ? (
        <div className="mt-2">
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-surface-sunken"
            role="progressbar"
            aria-valuenow={Math.round(progress.value)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={progressLabel}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                progress.tone === "pending" ? "bg-pending-solid" : "bg-approved-solid",
              )}
              style={{ width: `${Math.min(100, Math.max(2, progress.value))}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-2.5 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-2">
        {footer}
      </div>
    </>
  );

  if (!interactive) {
    return <div className="panel p-3.5">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onActivate?.(dispatch)}
      aria-label={`${label}: ${value} ${unit}. ${hrefDescription}`}
      className={cn(
        "panel group p-3.5 text-left transition-colors",
        "hover:border-slate-300 hover:bg-surface-muted/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic/55 focus-visible:ring-offset-1",
      )}
    >
      {body}
    </button>
  );
}

/**
 * E-Sign status card.
 *
 * Reads as a status panel rather than a count because the operator's real
 * question is "can I get this signed right now?" — which is answered by the
 * signer's presence plus the queue depth in front of them.
 */
function EsignCard({ kpi }: { kpi: KpiSummary }) {
  const dispatch = useAppDispatch();
  const now = useNow();

  return (
    <div className="panel p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-6 shrink-0 place-items-center rounded-sm border border-line bg-surface-muted text-fg-subtle">
            <PenLine className="size-3.5" aria-hidden />
          </span>
          <h3 className="truncate text-2xs font-semibold uppercase tracking-[0.045em] text-fg-subtle">
            Status Kades E-Sign
          </h3>
        </div>
        <ShieldCheck className="size-3.5 shrink-0 text-approved" aria-hidden />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <span className="relative flex size-2 shrink-0" aria-hidden>
          <span
            className={cn(
              "inline-flex size-2 rounded-full",
              kpi.signerOnline ? "bg-approved-solid pulse-ring text-approved-solid" : "bg-slate-400",
            )}
          />
        </span>
        <Badge
          variant={kpi.signerOnline ? "approved" : "neutral"}
          size="md"
          className="shrink-0 font-semibold"
        >
          {kpi.signerOnline ? "Online — Siap Tanda Tangan" : "Tidak Terhubung"}
        </Badge>
      </div>

      <p className="mt-1.5 text-2xs leading-4 text-fg-subtle">
        <span className="font-medium text-fg-muted">{kpi.signerName}</span>
        {kpi.signerLastSeenAt ? (
          <>
            {" · aktif "}
            <span className="tnum">{formatRelative(kpi.signerLastSeenAt, now)}</span>
          </>
        ) : null}
      </p>

      <div className="mt-2.5 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-2">
        <Button
          variant="pending"
          size="xs"
          className="shrink-0"
          onClick={() => {
            dispatch(queueActions.filtersCleared());
            dispatch(queueActions.statusesReplaced(["MENUNGGU_TTD_KADES"]));
          }}
          aria-label={`Buka ${kpi.signaturesPending} surat yang menunggu tanda tangan Kepala Desa`}
        >
          {formatNumber(kpi.signaturesPending)} Menunggu TTD
        </Button>
        <span className="tnum text-2xs text-fg-subtle">
          {formatNumber(kpi.signaturesSignedToday)} tuntas hari ini
          {kpi.avgTurnaroundHours !== null ? ` · rata-rata ${kpi.avgTurnaroundHours} jam` : ""}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function DeltaPill({
  value,
  suffix,
  context,
  invert = false,
}: {
  value: number;
  suffix: string;
  context: string;
  /** When true, an increase is a heavier workload rather than good news. */
  invert?: boolean;
}) {
  const neutral = value === 0;
  const positive = value > 0;
  const good = invert ? !positive : positive;

  const Icon = neutral ? Minus : positive ? ArrowUpRight : ArrowDownRight;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "tnum inline-flex items-center gap-1 text-2xs font-medium",
            neutral && "text-fg-subtle",
            !neutral && good && "text-approved",
            !neutral && !good && "text-rejected",
          )}
          tabIndex={0}
        >
          <Icon className="size-3" aria-hidden />
          {value > 0 ? "+" : ""}
          {formatNumber(value)} {suffix}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{context}</TooltipContent>
    </Tooltip>
  );
}

function KpiRowSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Memuat ringkasan operasional…</span>
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="panel p-3.5">
          <div className="flex items-center gap-2">
            <Skeleton className="size-6" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="mt-3 h-6 w-20" />
          <Skeleton className="mt-2 h-3 w-32" />
          <Skeleton className="mt-4 h-4 w-40" />
        </div>
      ))}
    </div>
  );
}

/** Exported for the topbar's shift pill, which formats the same way. */
export const formatShiftClock = formatClock;
