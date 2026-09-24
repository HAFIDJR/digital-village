"use client";

import { Inbox, ScanSearch } from "lucide-react";
import * as React from "react";

import { Kbd, Panel, PanelHeader } from "@/components/ui/primitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { useAppDispatch, useAppSelector } from "@/store";
import { queueActions } from "@/store/queue-slice";
import type { RequestStatus } from "@/db/schema";
import type { QueuePage } from "@/db/queries";

import { useNow } from "../now-context";
import { QueueAlertStrip, QueueTable } from "./queue-table";
import { QueuePagination, QueueToolbar } from "./queue-toolbar";

/**
 * The letter worklist panel.
 *
 * Rendered by three different routes with three different presets — the whole
 * queue (`/antrean`), the documents waiting on verification (`/verifikasi`) and
 * the ones waiting on the Kepala Desa (`/ttd`). The table, toolbar and alerts
 * are identical; only the preset and the header copy change, which is precisely
 * why this is one component and not three near-copies.
 */

/**
 * Applies a route's preset to the shared queue slice.
 *
 * The slice is intentionally shared — an officer who narrows the queue on
 * `/antrean` then opens `/verifikasi` is answering the same question — but a
 * route that *is* a preset has to win, otherwise the page's title and its
 * contents disagree. Runs once per mount, and only when the state actually
 * differs, so it never fights the officer's own filters afterwards.
 */
export function useQueuePreset(preset: RequestStatus[]) {
  const dispatch = useAppDispatch();
  const statuses = useAppSelector((state) => state.queue.statuses);

  const key = preset.join(",");
  const applied = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (applied.current === key) return;
    applied.current = key;

    const wanted = key.length ? (key.split(",") as RequestStatus[]) : [];
    const current = [...statuses].sort().join(",");
    const next = [...wanted].sort().join(",");
    if (current === next) return;

    dispatch(queueActions.filtersCleared());
    if (wanted.length) dispatch(queueActions.statusesReplaced(wanted));
    // `statuses` is read but deliberately not a dependency: this must only react
    // to the route's preset changing, not to the officer refining the filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, key]);
}

export function QueuePanel({
  queue,
  loading,
  resultLabel,
  title = "Antrean Pengajuan Surat Warga",
  description = "Verifikasi berkas, teruskan ke tanda tangan, dan cetak surat dari satu daftar kerja.",
  searchInputRef,
  className,
  action,
}: {
  queue?: QueuePage;
  loading: boolean;
  resultLabel: string;
  title?: string;
  description?: string;
  searchInputRef?: React.Ref<HTMLInputElement>;
  className?: string;
  action?: React.ReactNode;
}) {
  const now = useNow();
  const focusedIndex = useAppSelector((state) => state.queue.focusedIndex);
  const unprocessedTotal =
    (queue?.statusCounts.PENDING_VERIFIKASI ?? 0) + (queue?.statusCounts.BERKAS_TIDAK_LENGKAP ?? 0);

  return (
    <Panel className={className}>
      <PanelHeader
        title={title}
        description={description}
        icon={Inbox}
        action={
          <>
            <span className="tnum hidden text-2xs text-fg-subtle md:inline">{resultLabel}</span>
            {action}
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

      {queue ? (
        <QueueAlertStrip
          overdueTotal={queue.overdueTotal}
          unprocessedTotal={unprocessedTotal}
          total={queue.total}
        />
      ) : null}

      <QueueToolbar data={queue} resultLabel={resultLabel} searchInputRef={searchInputRef} />

      <QueueTable
        rows={queue?.rows ?? []}
        loading={loading}
        now={now}
        focusRowIndex={focusedIndex}
      />

      {queue ? (
        <QueuePagination
          page={queue.page}
          pageSize={queue.pageSize}
          totalPages={queue.totalPages}
          total={queue.total}
        />
      ) : null}
    </Panel>
  );
}

/** "Menampilkan … pengajuan · halaman n dari m" — shared by the three routes. */
export function queueResultLabel(queue: QueuePage | undefined) {
  if (!queue) return "";
  if (queue.total === 0) return "Tidak ada hasil";
  return `${formatNumber(queue.total)} pengajuan · halaman ${queue.page} dari ${queue.totalPages}`;
}

export function QueueNote({ children }: { children: React.ReactNode }) {
  return (
    <p className={cn("px-1 text-2xs leading-4 text-fg-subtle")}>{children}</p>
  );
}
