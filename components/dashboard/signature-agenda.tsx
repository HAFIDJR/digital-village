"use client";

import { BadgeCheck, Clock3, KeyRound, Stamp } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader, Skeleton } from "@/components/ui/primitives";
import { SIGNATURE_STATUS, TONE_CLASSES } from "@/lib/domain";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage, useGetWorkspaceQuery, useListSignaturesQuery } from "@/store/api";
import { useAppSelector } from "@/store";
import type { QueueQuery } from "@/lib/validators";

import { QueryErrorState } from "./feedback";
import { useNow } from "./now-context";
import { PageHeader, StatCard, StatStrip, TD_CLASS, TH_CLASS, TableEmpty, TableFrame, TableSkeleton } from "./page-kit";
import { QueuePanel, queueResultLabel, useQueuePreset } from "./queue/queue-panel";

/**
 * Agenda TTD Kades.
 *
 * Shows both sides of the same ceremony: the signature requests the Sekdes has
 * queued for the Kepala Desa, and the letters those requests block. The
 * passphrase ceremony itself lives in the review drawer (the officer opens a
 * row and signs it there), so this page is the schedule, not the pen.
 */
export function SignatureAgenda() {
  useQueuePreset(["MENUNGGU_TTD_KADES"]);
  const queue = useAppSelector((state) => state.queue);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const now = useNow();

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

  const workspace = useGetWorkspaceQuery(queryArgs);
  const signatures = useListSignaturesQuery();

  const pending = (signatures.data?.entries ?? []).filter((entry) => entry.status === "MENUNGGU");
  const signed = (signatures.data?.entries ?? []).filter(
    (entry) => entry.status === "DITANDATANGANI",
  );
  const oldestWaiting = pending.reduce<number | null>(
    (oldest, entry) =>
      entry.waitingHours === null ? oldest : oldest === null ? entry.waitingHours : Math.max(oldest, entry.waitingHours),
    null,
  );

  if (workspace.isError || (!workspace.isLoading && !workspace.data)) {
    return (
      <>
        <PageHeader eyebrow="Operasional" icon={Stamp} title="Agenda TTD Kades" />
        <QueryErrorState
          title="Gagal memuat agenda tanda tangan"
          message={errorMessage(workspace.error)}
          onRetry={() => workspace.refetch()}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Operasional · Tanda Tangan Elektronik"
        icon={Stamp}
        title="Agenda Tanda Tangan Kepala Desa"
        description="Antrean surat yang menunggu tanda tangan elektronik BSrE. Setiap tanda tangan memerlukan passphrase petugas penandatangan dan tercatat pada jejak audit desa."
        meta={
          <span className="tnum text-2xs text-fg-subtle">
            {formatNumber(pending.length)} menunggu · {formatNumber(signed.length)} selesai
          </span>
        }
      />

      <StatStrip>
        <StatCard
          label="Menunggu TTD"
          value={formatNumber(pending.length)}
          unit="dokumen"
          hint="Terkunci sampai Kepala Desa menandatangani"
          tone="pending"
          icon={Stamp}
        />
        <StatCard
          label="Menunggu terlama"
          value={oldestWaiting !== null ? formatNumber(oldestWaiting) : "—"}
          unit="jam"
          hint="Dihitung dari permintaan tanda tangan dibuat"
          tone={oldestWaiting !== null && oldestWaiting > 12 ? "rejected" : "neutral"}
          icon={Clock3}
        />
        <StatCard
          label="Sudah ditandatangani"
          value={formatNumber(workspace.data?.queue.statusCounts.DITANDATANGANI ?? 0)}
          unit="surat"
          hint="Sertifikat BSrE terlampir pada dokumen"
          tone="approved"
          icon={BadgeCheck}
        />
        <StatCard
          label="Kredensial penandatangan"
          value={workspace.data?.officer?.fullName ? "Aktif" : "—"}
          hint="Passphrase penandatangan terverifikasi pada sesi ini"
          tone="progress"
          icon={KeyRound}
        />
      </StatStrip>

      {/* ---------------------------------------------- signature requests */}
      <Panel>
        <PanelHeader
          title="Permintaan Tanda Tangan"
          description="Urut dari yang paling lama menunggu, diteruskan ke agenda Kepala Desa."
          icon={Stamp}
          action={
            <Badge variant="outline" size="sm">
              {formatNumber(signatures.data?.entries.length ?? 0)} permintaan
            </Badge>
          }
        />
        <TableFrame
          caption="Permintaan tanda tangan elektronik"
          minWidthClass="min-w-[960px]"
          busy={signatures.isLoading}
        >
          <thead>
            <tr>
              <th scope="col" className={cn(TH_CLASS, "w-[190px]")}>Dokumen</th>
              <th scope="col" className={cn(TH_CLASS, "w-[200px]")}>Pemohon</th>
              <th scope="col" className={cn(TH_CLASS, "w-[220px]")}>Jenis Surat</th>
              <th scope="col" className={cn(TH_CLASS, "w-[160px]")}>Status</th>
              <th scope="col" className={cn(TH_CLASS, "w-[180px]")}>Penandatangan</th>
              <th scope="col" className={cn(TH_CLASS, "w-[170px]")}>Waktu</th>
            </tr>
          </thead>

          {signatures.isLoading ? (
            <TableSkeleton
              columns={[
                { key: "a", width: "w-20" },
                { key: "b", width: "w-28" },
                { key: "c", width: "w-36" },
                { key: "d", width: "w-24" },
                { key: "e", width: "w-24" },
                { key: "f", width: "w-24" },
              ]}
              label="Memuat permintaan tanda tangan…"
            />
          ) : (signatures.data?.entries ?? []).length === 0 ? (
            <tbody>
              <TableEmpty
                colSpan={6}
                title="Tidak ada permintaan tanda tangan"
                message="Semua surat sudah ditandatangani. Permintaan baru muncul begitu Sekdes meneruskan berkas yang lengkap."
              />
            </tbody>
          ) : (
            <tbody>
              {signatures.data?.entries.map((entry) => {
                const meta = SIGNATURE_STATUS[entry.status] ?? {
                  label: entry.status,
                  tone: "neutral" as const,
                };
                return (
                  <tr key={entry.id} className="h-9 border-b border-line transition-colors hover:bg-surface-muted">
                    <td className={TD_CLASS}>
                      <div className="flex flex-col justify-center gap-0.5 leading-4">
                        <span className="font-mono text-xs font-semibold tabular-nums tracking-tight text-fg">
                          {entry.ticket}
                        </span>
                        <span className="truncate text-[10px] text-fg-subtle">
                          {entry.certificateSerial ?? "Sertifikat belum diterbitkan"}
                        </span>
                      </div>
                    </td>
                    <td className={TD_CLASS}>
                      <span className="truncate text-xs text-fg" title={entry.applicantName}>
                        {entry.applicantName}
                      </span>
                    </td>
                    <td className={TD_CLASS}>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="civic" size="sm" mono>
                          {entry.letterCode}
                        </Badge>
                        <span className="truncate text-xs text-fg-muted" title={entry.letterName}>
                          {entry.letterName}
                        </span>
                      </div>
                    </td>
                    <td className={TD_CLASS}>
                      <Badge variant="outline" size="sm" className={cn(TONE_CLASSES[meta.tone].chip)}>
                        {meta.label}
                      </Badge>
                    </td>
                    <td className={TD_CLASS}>
                      <span className="truncate text-xs text-fg-muted">
                        {entry.signerName?.replace(/,.*$/, "") ?? "Belum ditetapkan"}
                      </span>
                    </td>
                    <td className={TD_CLASS}>
                      <div className="flex flex-col justify-center gap-0.5 leading-4">
                        <span className="tnum text-xs text-fg">
                          {formatRelative(entry.requestedAt, now)}
                        </span>
                        <span className="tnum text-[10px] text-fg-subtle">
                          {entry.status === "MENUNGGU" && entry.waitingHours !== null
                            ? `${entry.waitingHours} jam menunggu`
                            : entry.signedAt
                              ? `TTD ${formatDateTime(entry.signedAt)}`
                              : formatDateTime(entry.requestedAt)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          )}
        </TableFrame>
      </Panel>

      {/* ------------------------------------------------- blocked letters */}
      <QueuePanel
        queue={workspace.data?.queue}
        loading={
          workspace.isLoading || (workspace.isFetching && !workspace.data?.queue.rows.length)
        }
        resultLabel={queueResultLabel(workspace.data?.queue)}
        searchInputRef={searchRef}
        title="Surat Menunggu Tanda Tangan"
        description="Buka satu baris untuk menandatangani dengan passphrase BSrE, atau cetak draft untuk ditandatangani basah."
      />

      {signatures.isLoading ? <Skeleton className="h-3 w-40" /> : null}
    </>
  );
}
