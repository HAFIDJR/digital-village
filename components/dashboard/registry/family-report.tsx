"use client";

import { ChartColumn, IdCard, RefreshCw, Users } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader, Progress } from "@/components/ui/primitives";
import {
  TONE_CLASSES,
  welfareTone,
} from "@/lib/domain";
import { formatDecimal, formatKk, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage, useGetRegistryReportQuery } from "@/store/api";

import { QueryErrorState } from "../feedback";
import {
  StatCard,
  StatStrip,
  TD_CLASS,
  TH_CLASS,
  TableFrame,
} from "../page-kit";

/**
 * Laporan Kartu Keluarga: sebaran jumlah anggota per KK, klasifikasi
 * kesejahteraan untuk pemetaan bantuan sosial, dan rekap per dusun.
 */
export function FamilyReport() {
  const report = useGetRegistryReportQuery();

  if (report.isError) {
    return (
      <QueryErrorState
        title="Gagal memuat laporan kartu keluarga"
        message={errorMessage(report.error)}
        onRetry={() => report.refetch()}
      />
    );
  }

  const data = report.data;
  const totals = data?.totals;
  const welfareTotal = (data?.welfareBreakdown ?? []).reduce(
    (sum, row) => sum + row.families,
    0,
  );
  const sizeTotal = (data?.sizeBreakdown ?? []).reduce(
    (sum, row) => sum + row.families,
    0,
  );

  return (
    <div className="space-y-3.5">
      <StatStrip>
        <StatCard
          label="Kartu keluarga"
          value={formatNumber(totals?.families ?? 0)}
          unit="KK"
          hint={`${formatNumber(totals?.members ?? 0)} anggota terdaftar`}
          icon={IdCard}
        />
        <StatCard
          label="Rata-rata anggota"
          value={formatDecimal(totals?.averageMembers ?? null)}
          unit="jiwa / KK"
          hint={`Terbesar ${formatNumber(totals?.largestFamilySize ?? 0)} anggota`}
          icon={Users}
        />
        <StatCard
          label="KK tanpa anggota"
          value={formatNumber(totals?.withoutMembers ?? 0)}
          unit="KK"
          hint="Perlu dilengkapi datanya oleh kepala dusun"
          tone={(totals?.withoutMembers ?? 0) > 0 ? "pending" : "approved"}
          icon={ChartColumn}
        />
        <StatCard
          label="Dusun tercatat"
          value={formatNumber(data?.dusunBreakdown.length ?? 0)}
          unit="dusun"
          hint="Wilayah dengan kartu keluarga aktif"
        />
      </StatStrip>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Panel className="min-w-0">
          <PanelHeader
            title="Klasifikasi kesejahteraan"
            description="Dasar pemetaan penerima bantuan sosial desa"
            icon={ChartColumn}
            action={
              <Button
                variant="ghost"
                size="xs"
                onClick={() => report.refetch()}
                disabled={report.isFetching}
                aria-label="Segarkan laporan kartu keluarga"
              >
                <RefreshCw className={cn(report.isFetching && "animate-spin")} aria-hidden />
              </Button>
            }
          />
          {data && data.welfareBreakdown.length ? (
            <ul className="divide-y divide-line">
              {data.welfareBreakdown.map((row) => {
                const share = welfareTotal ? (row.families / welfareTotal) * 100 : 0;
                return (
                  <li key={row.welfareClass} className="px-3.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-fg">
                        {row.welfareClass}
                      </span>
                      <span className="tnum shrink-0 text-2xs text-fg-subtle">
                        {formatNumber(row.families)} KK · {formatNumber(row.members)} jiwa
                      </span>
                    </div>
                    <Progress
                      value={share}
                      tone="civic"
                      className="mt-1.5"
                      label={`Porsi ${row.welfareClass}`}
                    />
                    <p className="tnum mt-1 text-[10px] text-fg-subtle">
                      {formatDecimal(share)}% dari seluruh kartu keluarga
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-3.5 py-6 text-center text-2xs text-fg-subtle">
              {report.isLoading ? "Memuat laporan…" : "Belum ada data kartu keluarga."}
            </p>
          )}
        </Panel>

        <Panel className="min-w-0">
          <PanelHeader
            title="Jumlah anggota per kartu keluarga"
            description="Sebaran ukuran rumah tangga di desa"
            icon={Users}
          />
          {data && data.sizeBreakdown.length ? (
            <ul className="divide-y divide-line">
              {data.sizeBreakdown.map((row) => {
                const share = sizeTotal ? (row.families / sizeTotal) * 100 : 0;
                return (
                  <li key={row.bucket} className="px-3.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-fg">
                        {row.bucket}
                      </span>
                      <span className="tnum shrink-0 text-2xs text-fg-subtle">
                        {formatNumber(row.families)} KK
                      </span>
                    </div>
                    <Progress
                      value={share}
                      tone="approved"
                      className="mt-1.5"
                      label={`Porsi ${row.bucket}`}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-3.5 py-6 text-center text-2xs text-fg-subtle">
              {report.isLoading ? "Memuat laporan…" : "Belum ada data kartu keluarga."}
            </p>
          )}
        </Panel>
      </div>

      <Panel className="min-w-0">
        <PanelHeader
          title="Rekap kartu keluarga per dusun"
          description="Jumlah kartu keluarga dan jiwa yang ditanggung tiap wilayah"
          icon={IdCard}
        />
        <TableFrame caption="Rekap kartu keluarga per dusun" minWidthClass="min-w-[620px]" busy={report.isLoading}>
          <thead>
            <tr>
              <th scope="col" className={cn(TH_CLASS, "w-[220px]")}>
                Dusun
              </th>
              <th scope="col" className={cn(TH_CLASS, "w-[140px]")}>
                Kartu keluarga
              </th>
              <th scope="col" className={cn(TH_CLASS, "w-[140px]")}>
                Jiwa terdaftar
              </th>
              <th scope="col" className={cn(TH_CLASS, "w-[160px]")}>
                Rata-rata anggota
              </th>
            </tr>
          </thead>
          <tbody>
            {(data?.dusunBreakdown ?? []).map((row) => (
              <tr
                key={row.code}
                className="h-9 border-b border-line transition-colors hover:bg-surface-muted"
              >
                <td className={TD_CLASS}>
                  <span className="text-xs font-medium text-fg">{row.name}</span>
                  <span className="tnum ml-1.5 font-mono text-[10px] text-fg-subtle">
                    {row.code}
                  </span>
                </td>
                <td className={cn(TD_CLASS, "tnum text-xs text-fg")}>
                  {formatNumber(row.families)}
                </td>
                <td className={cn(TD_CLASS, "tnum text-xs text-fg")}>
                  {formatNumber(row.members)}
                </td>
                <td className={cn(TD_CLASS, "tnum text-xs text-fg-muted")}>
                  {row.families ? formatDecimal(row.members / row.families) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </TableFrame>
      </Panel>

      <Panel className="min-w-0">
        <PanelHeader
          title="Kartu keluarga dengan anggota terbanyak"
          description="Prioritas pendataan ulang dan penyaluran bantuan"
          icon={Users}
        />
        <TableFrame
          caption="Kartu keluarga dengan anggota terbanyak"
          minWidthClass="min-w-[720px]"
          busy={report.isLoading}
        >
          <thead>
            <tr>
              <th scope="col" className={cn(TH_CLASS, "w-[200px]")}>
                Nomor KK
              </th>
              <th scope="col" className={cn(TH_CLASS, "w-[200px]")}>
                Kepala keluarga
              </th>
              <th scope="col" className={cn(TH_CLASS, "w-[120px]")}>
                Anggota
              </th>
              <th scope="col" className={cn(TH_CLASS, "w-[200px]")}>
                Kesejahteraan &amp; wilayah
              </th>
            </tr>
          </thead>
          <tbody>
            {(data?.largestFamilies ?? []).map((row) => {
              const tone = welfareTone(row.welfareClass);
              return (
                <tr
                  key={row.id}
                  className="h-9 border-b border-line transition-colors hover:bg-surface-muted"
                >
                  <td className={cn(TD_CLASS, "tnum font-mono text-[10px] text-fg-muted")}>
                    {formatKk(row.kkNumber)}
                  </td>
                  <td className={cn(TD_CLASS, "text-xs font-medium text-fg")}>
                    {row.headName}
                  </td>
                  <td className={cn(TD_CLASS, "tnum text-xs text-fg")}>
                    {formatNumber(row.memberCount)} jiwa
                  </td>
                  <td className={TD_CLASS}>
                    <div className="flex flex-col items-start gap-0.5">
                      <Badge
                        variant="outline"
                        size="sm"
                        className={cn(TONE_CLASSES[tone].chip)}
                      >
                        {row.welfareClass ?? "Tidak Tercatat"}
                      </Badge>
                      <span className="text-[10px] text-fg-subtle">
                        {row.dusun} · RT {String(row.rt).padStart(2, "0")}/RW{" "}
                        {String(row.rw).padStart(2, "0")}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableFrame>
      </Panel>
    </div>
  );
}
