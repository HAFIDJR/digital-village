"use client";

import {
  FileCheck2,
  FileText,
  History,
  PenLine,
  Printer,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Stamp,
  UserCog,
  X,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ACTIVITY_KIND, TONE_CLASSES } from "@/lib/domain";
import { formatClock, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActivityEntry } from "@/db/queries";
import { useAppDispatch } from "@/store";
import { queueActions } from "@/store/queue-slice";
import { useNow } from "./now-context";

const KIND_ICON: Record<string, typeof FileText> = {
  PENGAJUAN_BARU: FileText,
  VERIFIKASI_BERKAS: FileCheck2,
  PENOLAKAN: X,
  PERSETUJUAN: ShieldCheck,
  TANDA_TANGAN: Stamp,
  CETAK_SURAT: Printer,
  MUTASI_PENDUDUK: UserCog,
  PENGUMUMAN: PenLine,
  MASUK_LOG: History,
};

/**
 * Audit trail.
 *
 * This is not a decorative "recent activity" list. Every row here was written by
 * the same transaction that changed the underlying state (see `db/commands.ts`),
 * so an officer can reconcile the physical register book against it. Two
 * consequences for the design:
 *
 *  - the actor is always shown, never just the action — "who did this" is the
 *    question asked during an inspection;
 *  - rows referencing a document carry the ticket and open that document's
 *    drawer on click, because an audit line is only useful if you can reach the
 *    thing it describes.
 */
export function ActivityFeed({
  entries,
  loading,
  onRefresh,
  refreshing,
}: {
  entries: ActivityEntry[];
  loading: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const dispatch = useAppDispatch();
  const now = useNow();

  if (loading) return <ActivitySkeleton />;

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <History className="size-4 text-fg-subtle" aria-hidden />
        <p className="text-2xs text-fg-subtle">
          Belum ada aktivitas tercatat pada shift ini.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ol className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        {entries.map((entry, index) => {
          const meta = ACTIVITY_KIND[entry.kind as keyof typeof ACTIVITY_KIND];
          const tone = meta?.tone ?? "neutral";
          const Icon = KIND_ICON[entry.kind] ?? FileText;
          const clickable = entry.subjectType === "letter_request" && entry.subjectId;

          return (
            <li
              key={entry.id}
              className={cn(
                "group relative flex gap-2.5 px-3.5 py-2.5 transition-colors",
                clickable && "cursor-pointer hover:bg-surface-muted",
              )}
              onClick={
                clickable
                  ? () => {
                      dispatch(queueActions.requestSelected(entry.subjectId));
                    }
                  : undefined
              }
            >
              {/* Connector rail — a quiet spine, not a decorative timeline. */}
              <span className="relative flex w-4 shrink-0 flex-col items-center" aria-hidden>
                <span
                  className={cn(
                    "mt-0.5 grid size-4 place-items-center rounded-full",
                    TONE_CLASSES[tone].dot,
                  )}
                >
                  <Icon className="size-2.5 text-white" />
                </span>
                {index < entries.length - 1 ? (
                  <span className="mt-0.5 w-px flex-1 bg-line" />
                ) : null}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-xs leading-[18px] text-fg">{entry.summary}</p>

                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1.5" tabIndex={0}>
                        <span className="grid size-4 place-items-center rounded-full border border-line-strong bg-surface-muted text-[8px] font-semibold text-fg-muted">
                          {entry.actorInitials}
                        </span>
                        <span className="truncate text-[10px] text-fg-muted">{entry.actorName}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {entry.actorName} · {entry.actorRole}
                    </TooltipContent>
                  </Tooltip>

                  <span aria-hidden className="text-line-strong">
                    ·
                  </span>
                  <time
                    dateTime={entry.occurredAt}
                    className="tnum text-[10px] text-fg-subtle"
                    title={`${formatClock(entry.occurredAt)} WIB`}
                  >
                    {formatRelative(entry.occurredAt, now)}
                  </time>

                  {entry.subjectRef ? (
                    <>
                      <span aria-hidden className="text-line-strong">
                        ·
                      </span>
                      <span className="font-mono text-[10px] font-semibold tabular-nums text-civic">
                        {entry.subjectRef}
                      </span>
                    </>
                  ) : null}

                  {meta ? (
                    <Badge
                      variant="outline"
                      size="sm"
                      className={cn("ml-auto", TONE_CLASSES[tone].chip)}
                    >
                      {meta.label}
                    </Badge>
                  ) : null}
                </div>

                {/* QR verification codes are surfaced inline: they are the one
                    piece of metadata an officer is routinely asked to read out. */}
                {typeof entry.meta?.qr === "string" ? (
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-fg-subtle">
                    <QrCode className="size-3" aria-hidden />
                    <span className="font-mono">{entry.meta.qr}</span>
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-muted px-3.5 py-1.5">
        <p className="text-[10px] text-fg-subtle">
          Jejak audit permanen · {entries.length} catatan terakhir
        </p>
        {onRefresh ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Muat ulang jejak audit"
          >
            <RefreshCw className={cn(refreshing && "animate-spin")} aria-hidden />
            Segarkan
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="divide-y divide-line" aria-busy="true" aria-live="polite">
      <span className="sr-only">Memuat jejak audit…</span>
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex gap-2.5 px-3.5 py-2.5">
          <Skeleton className="size-4 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}
