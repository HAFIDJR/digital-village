"use client";

import { IdCard, MapPin, RefreshCw, Users, Venus } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/primitives";
import {
  GENDER_LABEL,
  MARITAL_STATUS_LABEL,
  REGISTRY_SORT_LABEL,
  RELIGION_LABEL,
  RESIDENT_STATUS,
  TONE_CLASSES,
  welfareTone,
} from "@/lib/domain";
import { formatDate, formatKk, formatNik, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage, useListRegistryQuery } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store";
import { activeRegistryFilterCount, registryActions } from "@/store/registry-slice";
import type { FamilyRow, ResidentRow } from "@/db/queries";
import type { RegistryQuery } from "@/lib/validators";

import { QueryErrorState } from "./feedback";
import {
  ClearFiltersButton,
  FacetMenu,
  PageHeader,
  Pager,
  ResultLabel,
  SearchBox,
  SortMenu,
  StatCard,
  StatStrip,
  TD_CLASS,
  TH_CLASS,
  TableEmpty,
  TableFrame,
  TableSkeleton,
  Toolbar,
  ToolbarRow,
} from "./page-kit";

/**
 * Population registry.
 *
 * Residents and Kartu Keluarga are the same screen with a different row shape —
 * both are "find a person or a household in this village". One component keeps
 * the filters, the density and the keyboard behaviour identical between them,
 * which matters because officers switch between the two dozens of times a day.
 */
export function RegistryWorkspace({ type }: { type: RegistryQuery["type"] }) {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((state) => state.registry);
  const filterCount = useAppSelector((state) => activeRegistryFilterCount(state.registry));
  const searchRef = React.useRef<HTMLInputElement>(null);

  // The route owns the list type: /penduduk is residents, /keluarga is families.
  React.useEffect(() => {
    if (filters.type !== type) dispatch(registryActions.typeChanged(type));
  }, [dispatch, filters.type, type]);

  const queryArgs = React.useMemo(
    () => ({
      type,
      q: filters.q,
      status: type === "residents" ? filters.statuses : [],
      dusun: filters.dusun,
      sort: filters.sort,
      page: filters.page,
      pageSize: filters.pageSize,
    }),
    [type, filters.q, filters.statuses, filters.dusun, filters.sort, filters.page, filters.pageSize],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useListRegistryQuery(queryArgs);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if (event.key === "f" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const isResidents = type === "residents";
  const totals = data?.totals;

  const resultLabel = data
    ? data.total === 0
      ? "Tidak ada data yang cocok"
      : `${formatNumber(data.total)} ${isResidents ? "penduduk" : "kartu keluarga"} · halaman ${data.page} dari ${data.totalPages}`
    : "";

  if (isError) {
    return (
      <>
        <PageHeader
          eyebrow="Data Desa"
          icon={isResidents ? Users : IdCard}
          title={isResidents ? "Data Penduduk" : "Kartu Keluarga"}
        />
        <QueryErrorState
          title="Gagal memuat data kependudukan"
          message={errorMessage(error)}
          onRetry={() => refetch()}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Data Desa · Registrasi Kependudukan"
        icon={isResidents ? Users : IdCard}
        title={isResidents ? "Data Penduduk Desa Sukamaju" : "Kartu Keluarga Desa Sukamaju"}
        description={
          isResidents
            ? "Basis data penduduk hasil sinkronisasi Disdukcapil: identitas, hubungan keluarga, pekerjaan, dan status kependudukan."
            : "Kepala keluarga, jumlah anggota, dan klasifikasi kesejahteraan untuk pemetaan bantuan sosial desa."
        }
        meta={
          <>
            <span className="tnum text-2xs text-fg-subtle">
              {formatNumber(data?.total ?? 0)} {isResidents ? "penduduk" : "KK"} pada saringan aktif
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-label="Muat ulang data kependudukan"
            >
              <RefreshCw className={cn(isFetching && "animate-spin")} aria-hidden />
              Segarkan
            </Button>
          </>
        }
      />

      <StatStrip>
        <StatCard
          label="Penduduk aktif"
          value={formatNumber(totals?.residents ?? 0)}
          unit="jiwa"
          hint="Berstatus AKTIF dan tercatat di desa"
          tone="approved"
          icon={Users}
        />
        <StatCard
          label="Kartu keluarga"
          value={formatNumber(totals?.families ?? 0)}
          unit="KK"
          hint={`${formatNumber(totals?.members ?? 0)} anggota terdaftar`}
          icon={IdCard}
        />
        <StatCard
          label="Laki-laki / Perempuan"
          value={`${formatNumber(totals?.male ?? 0)} / ${formatNumber(totals?.female ?? 0)}`}
          hint="Rasio jenis kelamin penduduk aktif"
          icon={Venus}
        />
        <StatCard
          label="Perlu peninjauan"
          value={formatNumber(totals?.inactive ?? 0)}
          unit="jiwa"
          hint="Pindah keluar, meninggal, atau data perlu diverifikasi"
          tone={(totals?.inactive ?? 0) > 0 ? "rejected" : "neutral"}
          icon={MapPin}
        />
      </StatStrip>

      <Panel className="min-w-0">
        <PanelHeader
          title={isResidents ? "Registrasi Penduduk" : "Registrasi Kartu Keluarga"}
          description={
            isResidents
              ? "Cari berdasarkan nama, NIK, atau nomor KK. Klik baris untuk melihat identitas lengkap."
              : "Cari berdasarkan nama kepala keluarga atau nomor KK."
          }
          icon={isResidents ? Users : IdCard}
          action={<ResultLabel>{resultLabel}</ResultLabel>}
        />

        <Toolbar>
          <ToolbarRow>
            <SearchBox
              value={filters.q}
              inputRef={searchRef}
              onChange={(value) => dispatch(registryActions.searchChanged(value))}
              placeholder={
                isResidents
                  ? "Cari nama warga, NIK 16 digit, atau nomor KK…"
                  : "Cari nama kepala keluarga atau nomor KK…"
              }
              label={isResidents ? "Cari data penduduk" : "Cari kartu keluarga"}
            />

            {isResidents ? (
              <FacetMenu
                label="Status"
                selected={filters.statuses}
                onToggle={(value) =>
                  dispatch(registryActions.statusToggled(value as never))
                }
                options={Object.entries(RESIDENT_STATUS).map(([value, meta]) => ({
                  value,
                  label: meta.label,
                  tone: meta.tone,
                  count: data?.statusCounts[value] ?? 0,
                }))}
              />
            ) : null}

            <FacetMenu
              label="Dusun"
              selected={filters.dusun}
              onToggle={(value) => dispatch(registryActions.dusunToggled(value))}
              options={(data?.dusunCounts ?? []).map((entry) => ({
                value: entry.code,
                label: entry.name,
                count: entry.count,
              }))}
            />

            <SortMenu
              value={filters.sort}
              options={REGISTRY_SORT_LABEL}
              onChange={(value) => dispatch(registryActions.sortChanged(value as never))}
              label="Urutkan data"
            />

            <ClearFiltersButton
              count={filterCount}
              onClick={() => dispatch(registryActions.filtersCleared())}
            />
          </ToolbarRow>
        </Toolbar>

        {isResidents ? (
          <ResidentTable
            rows={(data?.rows as ResidentRow[] | undefined) ?? []}
            loading={isLoading || (isFetching && !data?.rows.length)}
          />
        ) : (
          <FamilyTable
            rows={(data?.rows as FamilyRow[] | undefined) ?? []}
            loading={isLoading || (isFetching && !data?.rows.length)}
          />
        )}

        {data ? (
          <Pager
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            totalPages={data.totalPages}
            onPage={(page) => dispatch(registryActions.pageChanged(page))}
            onPageSize={(size) => dispatch(registryActions.pageSizeChanged(size))}
            noun={isResidents ? "penduduk" : "kartu keluarga"}
          />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-muted px-3.5 py-1.5">
          <p className="text-[10px] leading-4 text-fg-subtle">
            Data kependudukan disinkronkan dengan Disdukcapil Kabupaten Bandung. Perubahan status
            penduduk wajib disertai dokumen pendukung.
          </p>
          <span className="tnum shrink-0 text-[10px] text-fg-subtle">
            {formatNumber(data?.totals.residents ?? 0)} jiwa · {formatNumber(data?.totals.families ?? 0)} KK
          </span>
        </div>
      </Panel>
    </>
  );
}

const RESIDENT_COLUMNS = [
  { key: "name", label: "Nama & NIK", width: "w-[210px]" },
  { key: "kk", label: "Kartu Keluarga", width: "w-[150px]" },
  { key: "birth", label: "Lahir / Usia", width: "w-[150px]" },
  { key: "education", label: "Pendidikan & Pekerjaan", width: "w-[210px]" },
  { key: "area", label: "Alamat", width: "w-[210px]" },
  { key: "status", label: "Status", width: "w-[140px]" },
] as const;

function ResidentTable({ rows, loading }: { rows: ResidentRow[]; loading: boolean }) {
  return (
    <TableFrame caption="Registrasi penduduk desa" minWidthClass="min-w-[1070px]" busy={loading}>
      <thead>
        <tr>
          {RESIDENT_COLUMNS.map((column) => (
            <th key={column.key} scope="col" className={cn(TH_CLASS, column.width)}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>

      {loading ? (
        <TableSkeleton
          columns={RESIDENT_COLUMNS.map((column) => ({ key: column.key, width: column.width }))}
          label="Memuat data penduduk…"
        />
      ) : rows.length === 0 ? (
        <tbody>
          <TableEmpty
            colSpan={RESIDENT_COLUMNS.length}
            title="Tidak ada penduduk yang cocok"
            message="Ubah kata kunci, status, atau saringan dusun untuk menemukan data yang dicari."
          />
        </tbody>
      ) : (
        <tbody>
          {rows.map((row) => {
            const statusMeta = RESIDENT_STATUS[row.status] ?? {
              label: row.status,
              tone: "neutral" as const,
            };
            return (
              <tr key={row.id} className="h-9 border-b border-line transition-colors hover:bg-surface-muted">
                <td className={TD_CLASS}>
                  <div className="flex min-w-0 flex-col justify-center gap-0.5 leading-4">
                    <span className="truncate text-xs font-medium text-fg" title={row.fullName}>
                      {row.fullName}
                    </span>
                    <span className="truncate font-mono text-[10px] tabular-nums text-fg-subtle">
                      {formatNik(row.nik)}
                    </span>
                  </div>
                </td>
                <td className={TD_CLASS}>
                  <div className="flex flex-col justify-center gap-0.5 leading-4">
                    <span className="truncate font-mono text-[10px] tabular-nums text-fg-muted">
                      {formatKk(row.kkNumber)}
                    </span>
                    <span className="truncate text-[10px] text-fg-subtle">
                      {row.familyRelation ?? "—"}
                    </span>
                  </div>
                </td>
                <td className={TD_CLASS}>
                  <div className="flex flex-col justify-center gap-0.5 leading-4">
                    <span className="tnum text-xs text-fg">{row.age} tahun</span>
                    <span className="truncate text-[10px] text-fg-subtle" title={`${row.birthPlace}, ${row.birthDate}`}>
                      {row.birthPlace}, {formatDate(row.birthDate)}
                    </span>
                  </div>
                </td>
                <td className={TD_CLASS}>
                  <div className="flex min-w-0 flex-col justify-center gap-0.5 leading-4">
                    <span className="truncate text-xs text-fg" title={row.occupation ?? "—"}>
                      {row.occupation ?? "Tidak tercatat"}
                    </span>
                    <span className="truncate text-[10px] text-fg-subtle">
                      {row.education ?? "—"} · {MARITAL_STATUS_LABEL[row.maritalStatus] ?? row.maritalStatus}
                    </span>
                  </div>
                </td>
                <td className={TD_CLASS}>
                  <div className="flex min-w-0 flex-col justify-center gap-0.5 leading-4">
                    <span className="truncate text-xs text-fg">
                      {row.dusun} · RT {String(row.rt).padStart(2, "0")}/RW{" "}
                      {String(row.rw).padStart(2, "0")}
                    </span>
                    <span className="truncate text-[10px] text-fg-subtle" title={row.address}>
                      {row.address}
                    </span>
                  </div>
                </td>
                <td className={TD_CLASS}>
                  <div className="flex flex-col items-start gap-0.5 leading-4">
                    <Badge
                      variant="outline"
                      size="sm"
                      className={cn(TONE_CLASSES[statusMeta.tone].chip)}
                    >
                      {statusMeta.label}
                    </Badge>
                    <span className="text-[10px] text-fg-subtle">
                      {GENDER_LABEL[row.gender] ?? row.gender} ·{" "}
                      {RELIGION_LABEL[row.religion] ?? row.religion}
                    </span>
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

const FAMILY_COLUMNS = [
  { key: "kk", label: "No. Kartu Keluarga", width: "w-[190px]" },
  { key: "head", label: "Kepala Keluarga", width: "w-[200px]" },
  { key: "members", label: "Anggota", width: "w-[110px]" },
  { key: "welfare", label: "Klasifikasi", width: "w-[150px]" },
  { key: "area", label: "Alamat", width: "w-[260px]" },
] as const;

function FamilyTable({ rows, loading }: { rows: FamilyRow[]; loading: boolean }) {
  return (
    <TableFrame caption="Registrasi kartu keluarga" minWidthClass="min-w-[940px]" busy={loading}>
      <thead>
        <tr>
          {FAMILY_COLUMNS.map((column) => (
            <th key={column.key} scope="col" className={cn(TH_CLASS, column.width)}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>

      {loading ? (
        <TableSkeleton
          columns={FAMILY_COLUMNS.map((column) => ({ key: column.key, width: column.width }))}
          label="Memuat kartu keluarga…"
        />
      ) : rows.length === 0 ? (
        <tbody>
          <TableEmpty
            colSpan={FAMILY_COLUMNS.length}
            title="Tidak ada kartu keluarga yang cocok"
            message="Ubah kata kunci atau saringan dusun untuk menemukan data yang dicari."
          />
        </tbody>
      ) : (
        <tbody>
          {rows.map((row) => {
            const tone = welfareTone(row.welfareClass);
            return (
              <tr key={row.id} className="h-9 border-b border-line transition-colors hover:bg-surface-muted">
                <td className={TD_CLASS}>
                  <span className="font-mono text-xs tabular-nums text-fg">
                    {formatKk(row.kkNumber)}
                  </span>
                </td>
                <td className={TD_CLASS}>
                  <div className="flex min-w-0 flex-col justify-center gap-0.5 leading-4">
                    <span className="truncate text-xs font-medium text-fg" title={row.headName}>
                      {row.headName}
                    </span>
                    <span className="truncate font-mono text-[10px] tabular-nums text-fg-subtle">
                      {row.headNik ? formatNik(row.headNik) : "NIK kepala keluarga belum tercatat"}
                    </span>
                  </div>
                </td>
                <td className={TD_CLASS}>
                  <span className="tnum text-xs text-fg">{row.memberCount} orang</span>
                </td>
                <td className={TD_CLASS}>
                  {row.welfareClass ? (
                    <Badge variant="outline" size="sm" className={cn(TONE_CLASSES[tone].chip)}>
                      {row.welfareClass}
                    </Badge>
                  ) : (
                    <span className="text-2xs text-fg-subtle">Belum diklasifikasi</span>
                  )}
                </td>
                <td className={TD_CLASS}>
                  <div className="flex min-w-0 flex-col justify-center gap-0.5 leading-4">
                    <span className="truncate text-xs text-fg">
                      {row.dusun} · RT {String(row.rt).padStart(2, "0")}/RW{" "}
                      {String(row.rw).padStart(2, "0")}
                    </span>
                    <span className="truncate text-[10px] text-fg-subtle" title={row.address}>
                      {row.address}
                    </span>
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
