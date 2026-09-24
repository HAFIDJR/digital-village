"use client";

import { Home, IdCard, MapPin, MessageSquareWarning, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/ui/primitives";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage, useListAreasQuery } from "@/store/api";

import { QueryErrorState } from "./feedback";
import {
  PageHeader,
  StatCard,
  StatStrip,
  TD_CLASS,
  TH_CLASS,
  TableEmpty,
  TableFrame,
  TableSkeleton,
} from "./page-kit";

/**
 * Wilayah & Dusun.
 *
 * The village's own geography, with the population each area carries. Officers
 * use it to answer "how many people live in Dusun 03?" without running a
 * registry query, and to see which dusun generates the most paperwork.
 */
export function AreaWorkspace() {
  const { data, isLoading, isError, error, refetch } = useListAreasQuery();

  const hamlets = data?.hamlets ?? [];
  const neighborhoods = data?.neighborhoods ?? [];

  const totals = hamlets.reduce(
    (accumulator, hamlet) => ({
      residents: accumulator.residents + hamlet.residents,
      families: accumulator.families + hamlet.families,
      reports: accumulator.reports + hamlet.reports,
      requests: accumulator.requests + hamlet.requests,
    }),
    { residents: 0, families: 0, reports: 0, requests: 0 },
  );

  if (isError) {
    return (
      <>
        <PageHeader eyebrow="Data Desa" icon={MapPin} title="Wilayah & Dusun" />
        <QueryErrorState
          title="Gagal memuat data wilayah"
          message={errorMessage(error)}
          onRetry={() => refetch()}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Data Desa · Kewilayahan"
        icon={MapPin}
        title="Wilayah, Dusun, dan RT/RW"
        description="Pembagian wilayah administratif Desa Sukamaju beserta jumlah penduduk, kartu keluarga, dan beban layanan tiap dusun."
        meta={
          <span className="tnum text-2xs text-fg-subtle">
            {formatNumber(hamlets.length)} dusun · {formatNumber(neighborhoods.length)} RT
          </span>
        }
      />

      <StatStrip>
        <StatCard
          label="Jumlah dusun"
          value={formatNumber(hamlets.length)}
          unit="wilayah"
          hint="Dipimpin seorang Kepala Dusun"
          icon={MapPin}
        />
        <StatCard
          label="Rukun tetangga"
          value={formatNumber(neighborhoods.length)}
          unit="RT"
          hint={formatNumber(new Set(neighborhoods.map((n) => n.rw)).size) + " RW terdaftar"}
          icon={Home}
        />
        <StatCard
          label="Penduduk aktif"
          value={formatNumber(totals.residents)}
          unit="jiwa"
          hint={`${formatNumber(totals.families)} kartu keluarga`}
          tone="approved"
          icon={Users}
        />
        <StatCard
          label="Laporan warga"
          value={formatNumber(totals.reports)}
          unit="laporan"
          hint={`${formatNumber(totals.requests)} pengajuan surat dari seluruh dusun`}
          tone="progress"
          icon={MessageSquareWarning}
        />
      </StatStrip>

      <Panel>
        <PanelHeader
          title="Rekap per Dusun"
          description="Jumlah penduduk, keluarga, laporan warga, dan pengajuan surat yang berasal dari masing-masing dusun."
          icon={MapPin}
        />
        <TableFrame caption="Rekap wilayah per dusun" minWidthClass="min-w-[880px]" busy={isLoading}>
          <thead>
            <tr>
              <th scope="col" className={cn(TH_CLASS, "w-[210px]")}>Dusun</th>
              <th scope="col" className={cn(TH_CLASS, "w-[200px]")}>Kepala Dusun</th>
              <th scope="col" className={cn(TH_CLASS, "w-[110px]")}>RT</th>
              <th scope="col" className={cn(TH_CLASS, "w-[120px]")}>Penduduk</th>
              <th scope="col" className={cn(TH_CLASS, "w-[110px]")}>KK</th>
              <th scope="col" className={cn(TH_CLASS, "w-[130px]")}>Laporan</th>
              <th scope="col" className={cn(TH_CLASS, "w-[130px]")}>Pengajuan</th>
            </tr>
          </thead>

          {isLoading ? (
            <TableSkeleton
              columns={[
                { key: "a", width: "w-28" },
                { key: "b", width: "w-32" },
                { key: "c", width: "w-8" },
                { key: "d", width: "w-12" },
                { key: "e", width: "w-10" },
                { key: "f", width: "w-10" },
                { key: "g", width: "w-10" },
              ]}
              label="Memuat data wilayah…"
              rows={4}
            />
          ) : hamlets.length === 0 ? (
            <tbody>
              <TableEmpty
                colSpan={7}
                title="Data wilayah belum tersedia"
                message="Dusun dan RT/RW akan muncul setelah pemetaan wilayah desa diunggah."
              />
            </tbody>
          ) : (
            <tbody>
              {hamlets.map((hamlet) => (
                <tr key={hamlet.id} className="h-9 border-b border-line transition-colors hover:bg-surface-muted">
                  <td className={TD_CLASS}>
                    <div className="flex items-center gap-2">
                      <Badge variant="civic" size="sm" mono>
                        {hamlet.code}
                      </Badge>
                      <span className="truncate text-xs font-medium text-fg">{hamlet.name}</span>
                    </div>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="truncate text-xs text-fg-muted">
                      {hamlet.headName ?? "Belum ditetapkan"}
                    </span>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="tnum text-xs text-fg">
                      {formatNumber(hamlet.neighborhoodCount)}
                    </span>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="tnum text-xs font-semibold text-fg">
                      {formatNumber(hamlet.residents)}
                    </span>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="tnum text-xs text-fg-muted">
                      {formatNumber(hamlet.families)}
                    </span>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="tnum text-xs text-fg-muted">
                      {formatNumber(hamlet.reports)}
                    </span>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="tnum text-xs text-fg-muted">
                      {formatNumber(hamlet.requests)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </TableFrame>
      </Panel>

      <Panel>
        <PanelHeader
          title="Daftar RT / RW"
          description="Jumlah penduduk dan keluarga per rukun tetangga, dipakai saat memverifikasi alamat pemohon."
          icon={Home}
          action={
            <Badge variant="outline" size="sm">
              <IdCard className="size-3" aria-hidden />
              {formatNumber(neighborhoods.length)} wilayah
            </Badge>
          }
        />
        <TableFrame caption="Daftar RT dan RW" minWidthClass="min-w-[820px]" busy={isLoading}>
          <thead>
            <tr>
              <th scope="col" className={cn(TH_CLASS, "w-[200px]")}>Dusun</th>
              <th scope="col" className={cn(TH_CLASS, "w-[140px]")}>RT / RW</th>
              <th scope="col" className={cn(TH_CLASS, "w-[220px]")}>Ketua RT</th>
              <th scope="col" className={cn(TH_CLASS, "w-[130px]")}>Penduduk</th>
              <th scope="col" className={cn(TH_CLASS, "w-[120px]")}>KK</th>
            </tr>
          </thead>

          {isLoading ? (
            <TableSkeleton
              columns={[
                { key: "a", width: "w-28" },
                { key: "b", width: "w-16" },
                { key: "c", width: "w-32" },
                { key: "d", width: "w-12" },
                { key: "e", width: "w-10" },
              ]}
              label="Memuat daftar RT/RW…"
            />
          ) : neighborhoods.length === 0 ? (
            <tbody>
              <TableEmpty
                colSpan={5}
                title="Belum ada RT/RW terdaftar"
                message="Wilayah rukun tetangga akan muncul setelah pemetaan wilayah desa diunggah."
              />
            </tbody>
          ) : (
            <tbody>
              {neighborhoods.map((entry) => (
                <tr key={entry.id} className="h-9 border-b border-line transition-colors hover:bg-surface-muted">
                  <td className={TD_CLASS}>
                    <span className="truncate text-xs text-fg">{entry.hamlet}</span>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="tnum font-mono text-xs text-fg">
                      RT {String(entry.rt).padStart(2, "0")}/RW {String(entry.rw).padStart(2, "0")}
                    </span>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="truncate text-xs text-fg-muted">
                      {entry.headName ?? "Belum ditetapkan"}
                    </span>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="tnum text-xs font-semibold text-fg">
                      {formatNumber(entry.residents)}
                    </span>
                  </td>
                  <td className={TD_CLASS}>
                    <span className="tnum text-xs text-fg-muted">
                      {formatNumber(entry.families)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </TableFrame>
      </Panel>
    </>
  );
}
