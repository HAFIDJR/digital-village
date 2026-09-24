"use client";

import { ClipboardCheck, FileWarning, ScanLine, ShieldCheck } from "lucide-react";
import * as React from "react";

import { Panel, PanelHeader } from "@/components/ui/primitives";
import { formatNumber } from "@/lib/format";
import { errorMessage, useGetWorkspaceQuery } from "@/store/api";
import { useAppSelector } from "@/store";
import type { QueueQuery } from "@/lib/validators";

import { QueryErrorState } from "./feedback";
import { PageHeader, StatCard, StatStrip } from "./page-kit";
import { QueuePanel, queueResultLabel, useQueuePreset } from "./queue/queue-panel";

/**
 * Verifikasi Berkas.
 *
 * A route rather than a filter preset hidden in a dropdown: document
 * verification is a distinct job with its own owner at the counter, and the
 * officer who does it should be able to bookmark it, hand the URL to a
 * colleague, and see the sidebar say where they are.
 */
const PRESET = ["PENDING_VERIFIKASI", "BERKAS_TIDAK_LENGKAP"] as const;

export function VerificationWorkspace() {
  useQueuePreset([...PRESET]);
  const queue = useAppSelector((state) => state.queue);
  const searchRef = React.useRef<HTMLInputElement>(null);

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

  const { data, isLoading, isFetching, isError, error, refetch } = useGetWorkspaceQuery(queryArgs);

  const pending = data?.queue.statusCounts.PENDING_VERIFIKASI ?? 0;
  const incomplete = data?.queue.statusCounts.BERKAS_TIDAK_LENGKAP ?? 0;

  if (isError || (!isLoading && !data)) {
    return (
      <>
        <PageHeader eyebrow="Operasional" icon={ClipboardCheck} title="Verifikasi Berkas" />
        <QueryErrorState
          title="Gagal memuat berkas yang menunggu verifikasi"
          message={errorMessage(error)}
          onRetry={() => refetch()}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Operasional · Loket Pelayanan"
        icon={ClipboardCheck}
        title="Verifikasi Berkas Pengajuan"
        description="Periksa kelengkapan dan keterbacaan berkas yang diunggah warga, lalu setujui atau minta perbaikan sebelum diteruskan ke tanda tangan Kepala Desa."
        meta={
          <span className="tnum text-2xs text-fg-subtle">
            {formatNumber(pending + incomplete)} berkas menunggu
          </span>
        }
      />

      <StatStrip>
        <StatCard
          label="Menunggu diperiksa"
          value={formatNumber(pending)}
          unit="berkas"
          hint="Belum pernah dibuka petugas loket"
          tone="pending"
          icon={ScanLine}
        />
        <StatCard
          label="Perlu perbaikan"
          value={formatNumber(incomplete)}
          unit="berkas"
          hint="Ada dokumen buram, hilang, atau tidak relevan"
          tone="rejected"
          icon={FileWarning}
        />
        <StatCard
          label="Lewat batas SLA"
          value={formatNumber(data?.queue.overdueTotal ?? 0)}
          unit="berkas"
          hint="Melewati tenggat pelayanan 3 hari kerja"
          tone={(data?.kpi.overdueCount ?? 0) > 0 ? "pending" : "neutral"}
          icon={ShieldCheck}
        />
        <StatCard
          label="Selesai diverifikasi"
          value={formatNumber(data?.queue.statusCounts.DIVERIFIKASI ?? 0)}
          unit="berkas"
          hint="Siap diteruskan ke agenda tanda tangan"
          tone="approved"
          icon={ClipboardCheck}
        />
      </StatStrip>

      <QueuePanel
        queue={data?.queue}
        loading={isLoading || (isFetching && !data?.queue.rows.length)}
        resultLabel={queueResultLabel(data?.queue)}
        searchInputRef={searchRef}
        title="Berkas Menunggu Verifikasi"
        description="Klik satu baris untuk membuka dossier pemohon dan menilai setiap dokumen yang diunggah."
      />

      <Panel>
        <PanelHeader
          title="Pedoman Penilaian Berkas"
          description="Acuan petugas loket saat menilai unggahan warga — hasil penilaian tercatat permanen pada dossier."
          icon={ShieldCheck}
        />
        <dl className="grid gap-x-6 gap-y-3 px-3.5 py-3 sm:grid-cols-3">
          <Guideline
            term="Lengkap"
            tone="approved"
            detail="Dokumen terbaca jelas, sesuai jenis surat, dan berlaku. Pengajuan dapat diteruskan."
          />
          <Guideline
            term="Buram"
            tone="pending"
            detail="Terbaca namun tidak memenuhi standar arsip — minta warga memindai ulang sebelum diverifikasi ulang."
          />
          <Guideline
            term="Tidak Ada / Tidak Relevan"
            tone="rejected"
            detail="Dokumen belum diunggah atau tidak sesuai persyaratan. Tuliskan catatan agar warga tahu berkas mana yang harus diganti."
          />
        </dl>
      </Panel>
    </>
  );
}

function Guideline({
  term,
  detail,
  tone,
}: {
  term: string;
  detail: string;
  tone: "approved" | "pending" | "rejected";
}) {
  const dot =
    tone === "approved"
      ? "bg-approved-solid"
      : tone === "pending"
        ? "bg-pending-solid"
        : "bg-rejected-solid";

  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-semibold text-fg">
        <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
        {term}
      </dt>
      <dd className="mt-1 text-2xs leading-4 text-fg-muted">{detail}</dd>
    </div>
  );
}
