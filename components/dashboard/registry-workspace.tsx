"use client";

import {
  IdCard,
  KeyRound,
  MapPin,
  PencilLine,
  PieChart,
  RefreshCw,
  Trash2,
  UserCog,
  Users,
  UserPlus,
  Venus,
} from "lucide-react";
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
  RESIDENT_STATUS_ORDER,
  ROLE_CAPABILITIES,
  TONE_CLASSES,
  welfareTone,
} from "@/lib/domain";
import { formatDate, formatKk, formatNik, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  errorMessage,
  useDeleteFamilyMutation,
  useDeleteResidentMutation,
  useGetShellQuery,
  useListRegistryQuery,
  useUpdateResidentMutation,
} from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store";
import { activeRegistryFilterCount, registryActions } from "@/store/registry-slice";
import type { FamilyDetail, FamilyRow, ResidentRow } from "@/db/queries";
import type { StaffRole } from "@/db/schema";
import type { RegistryQuery } from "@/lib/validators";

import { FamilyDetailDrawer } from "./registry/family-detail-drawer";
import { FamilyFormDialog } from "./registry/family-form-dialog";
import { FamilyReport } from "./registry/family-report";
import { ResidentAccountDialog } from "./registry/resident-account-dialog";
import type { ResidentAccountTarget } from "./registry/resident-account-dialog.tsx";
import { ResidentFormDialog } from "./registry/resident-form-dialog";

import { QueryErrorState, toastFromMutation } from "./feedback";
import { ConfirmDialog } from "./confirm-dialog";
import { RowActions } from "./row-actions";
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

export function RegistryWorkspace({ type }: { type: RegistryQuery["type"] }) {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((state) => state.registry);
  const filterCount = useAppSelector((state) => activeRegistryFilterCount(state.registry));
  const searchRef = React.useRef<HTMLInputElement>(null);


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
  const shell = useGetShellQuery();

  const [residentFormOpen, setResidentFormOpen] = React.useState(false);
  const [familyFormOpen, setFamilyFormOpen] = React.useState(false);
  const [accountTarget, setAccountTarget] = React.useState<ResidentAccountTarget | null>(null);
  const [residentEditTarget, setResidentEditTarget] = React.useState<ResidentRow | null>(null);
  const [residentDeleteTarget, setResidentDeleteTarget] = React.useState<ResidentRow | null>(null);
  const [familyEditTarget, setFamilyEditTarget] = React.useState<FamilyDetail | null>(null);
  const [familyDeleteTarget, setFamilyDeleteTarget] = React.useState<FamilyRow | null>(null);
  const [reportOpen, setReportOpen] = React.useState(false);
  const [formNonce, setFormNonce] = React.useState(0);
  const selectedFamilyId = useAppSelector((state) => state.registry.selectedFamilyId);

  const [deleteResident, deleteResidentState] = useDeleteResidentMutation();
  const [deleteFamily, deleteFamilyState] = useDeleteFamilyMutation();
  const [updateResident, updateResidentState] = useUpdateResidentMutation();

  const canManageRegistry = shell.data?.officer
    ? (ROLE_CAPABILITIES[shell.data.officer.role as StaffRole]?.manageRegistry ?? false)
    : false;

  const confirmResidentDelete = async () => {
    if (!residentDeleteTarget) return;
    try {
      const result = await deleteResident(residentDeleteTarget.id).unwrap();
      toastFromMutation(dispatch, {
        tone: "success",
        title: "Penduduk dihapus",
        body: `${result.resident.fullName} (NIK ${formatNik(result.resident.nik)}) dihapus dari register penduduk.`,
      });
      setResidentDeleteTarget(null);
    } catch {
      // The dialog keeps the server message inline (e.g. RESIDENT_HAS_RECORDS).
    }
  };

  const confirmFamilyDelete = async () => {
    if (!familyDeleteTarget) return;
    try {
      const result = await deleteFamily(familyDeleteTarget.id).unwrap();
      toastFromMutation(dispatch, {
        tone: "success",
        title: "Kartu keluarga dihapus",
        body: `KK ${formatKk(result.family.kkNumber)} atas nama ${result.family.headName} dihapus; ${result.family.releasedMemberIds.length} anggota dilepas dari kartu keluarga.`,
      });
      setFamilyDeleteTarget(null);
      dispatch(registryActions.familySelected(null));
    } catch {
      // The dialog keeps the server message inline.
    }
  };

  const changeResidentStatus = async (row: ResidentRow, status: string) => {
    try {
      await updateResident({ id: row.id, body: { status: status as never } }).unwrap();
      toastFromMutation(dispatch, {
        tone: "success",
        title: "Status penduduk diubah",
        body: `${row.fullName} kini berstatus ${RESIDENT_STATUS[status]?.label ?? status}.`,
      });
    } catch (error) {
      toastFromMutation(dispatch, {
        tone: "danger",
        title: "Status gagal diubah",
        body: errorMessage(error),
      });
    }
  };

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
            {canManageRegistry ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setFormNonce((nonce) => nonce + 1);
                  if (isResidents) setResidentFormOpen(true);
                  else setFamilyFormOpen(true);
                }}
              >
                {isResidents ? <UserPlus aria-hidden /> : <Users aria-hidden />}
                {isResidents ? "Tambah Penduduk" : "Tambah Kartu Keluarga"}
              </Button>
            ) : null}
            {!isResidents ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setReportOpen((open) => !open)}
                aria-expanded={reportOpen}
              >
                <PieChart aria-hidden />
                {reportOpen ? "Sembunyikan laporan" : "Laporan KK"}
              </Button>
            ) : null}
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

      {!isResidents && reportOpen ? <FamilyReport /> : null}

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
            canManageRegistry={canManageRegistry}
            onCreateAccount={setAccountTarget}
            onEditResident={(row) => {
              setFormNonce((nonce) => nonce + 1);
              setResidentEditTarget(row);
            }}
            onDeleteResident={setResidentDeleteTarget}
            onStatusChange={changeResidentStatus}
            statusBusy={updateResidentState.isLoading}
          />
        ) : (
          <FamilyTable
            rows={(data?.rows as FamilyRow[] | undefined) ?? []}
            loading={isLoading || (isFetching && !data?.rows.length)}
            canManageRegistry={canManageRegistry}
            onOpenDetail={(id) => dispatch(registryActions.familySelected(id))}
            onDeleteFamily={(row) => setFamilyDeleteTarget(row)}
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

      <ResidentFormDialog
        key={`resident-${formNonce}-${residentEditTarget?.id ?? "new"}`}
        open={residentFormOpen || residentEditTarget !== null}
        resident={residentEditTarget}
        onOpenChange={(open) => {
          if (!open) {
            setResidentFormOpen(false);
            setResidentEditTarget(null);
          }
        }}
      />
      <FamilyFormDialog
        key={`family-${formNonce}-${familyEditTarget?.id ?? "new"}`}
        open={familyFormOpen || familyEditTarget !== null}
        family={familyEditTarget}
        onOpenChange={(open) => {
          if (!open) {
            setFamilyFormOpen(false);
            setFamilyEditTarget(null);
          }
        }}
      />
      <ResidentAccountDialog
        key={`account-${accountTarget?.id ?? "none"}`}
        resident={accountTarget}
        open={accountTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAccountTarget(null);
        }}
      />

      <FamilyDetailDrawer
        familyId={selectedFamilyId}
        onClose={() => dispatch(registryActions.familySelected(null))}
        canManage={canManageRegistry}
        onEdit={(family) => {
          dispatch(registryActions.familySelected(null));
          setFormNonce((nonce) => nonce + 1);
          setFamilyEditTarget(family);
        }}
        onDelete={(family) => setFamilyDeleteTarget(family)}
      />

      <ConfirmDialog
        open={residentDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResidentDeleteTarget(null);
        }}
        tone="danger"
        icon={Trash2}
        title="Hapus data penduduk?"
        description="Penghapusan bersifat permanen dan dicatat pada jejak audit desa. Penduduk yang masih memiliki pengajuan surat atau laporan tidak dapat dihapus — gunakan mutasi Pindah Keluar atau Meninggal."
        details={
          residentDeleteTarget ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-fg-subtle">Nama</dt>
              <dd className="font-medium text-fg">{residentDeleteTarget.fullName}</dd>
              <dt className="text-fg-subtle">NIK</dt>
              <dd className="tnum font-mono text-fg">{formatNik(residentDeleteTarget.nik)}</dd>
              <dt className="text-fg-subtle">Kartu keluarga</dt>
              <dd className="tnum font-mono text-fg">
                {residentDeleteTarget.kkNumber
                  ? formatKk(residentDeleteTarget.kkNumber)
                  : "Tanpa KK"}
              </dd>
              <dt className="text-fg-subtle">Status</dt>
              <dd className="text-fg">
                {RESIDENT_STATUS[residentDeleteTarget.status]?.label ??
                  residentDeleteTarget.status}
              </dd>
            </dl>
          ) : null
        }
        confirmLabel="Hapus penduduk"
        loading={deleteResidentState.isLoading}
        error={deleteResidentState.isError ? errorMessage(deleteResidentState.error) : null}
        onConfirm={confirmResidentDelete}
      />

      <ConfirmDialog
        open={familyDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setFamilyDeleteTarget(null);
        }}
        tone="danger"
        icon={Trash2}
        title="Hapus kartu keluarga?"
        description="Kartu keluarga dihapus dari register. Data penduduk anggota tidak ikut terhapus — mereka dilepas dan kembali tercatat tanpa nomor KK."
        details={
          familyDeleteTarget ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <dt className="text-fg-subtle">Nomor KK</dt>
              <dd className="tnum font-mono text-fg">{formatKk(familyDeleteTarget.kkNumber)}</dd>
              <dt className="text-fg-subtle">Kepala keluarga</dt>
              <dd className="font-medium text-fg">{familyDeleteTarget.headName}</dd>
              <dt className="text-fg-subtle">Anggota</dt>
              <dd className="tnum text-fg">{familyDeleteTarget.memberCount} orang</dd>
            </dl>
          ) : null
        }
        confirmLabel="Hapus kartu keluarga"
        loading={deleteFamilyState.isLoading}
        error={deleteFamilyState.isError ? errorMessage(deleteFamilyState.error) : null}
        onConfirm={confirmFamilyDelete}
      />
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
  { key: "actions", label: "Akun & Aksi", width: "w-[190px]" },
] as const;

function ResidentTable({
  rows,
  loading,
  canManageRegistry,
  onCreateAccount,
  onEditResident,
  onDeleteResident,
  onStatusChange,
  statusBusy,
}: {
  rows: ResidentRow[];
  loading: boolean;
  canManageRegistry: boolean;
  onCreateAccount: (resident: ResidentAccountTarget) => void;
  onEditResident: (resident: ResidentRow) => void;
  onDeleteResident: (resident: ResidentRow) => void;
  onStatusChange: (resident: ResidentRow, status: string) => void;
  statusBusy: boolean;
}) {
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
                <td className={TD_CLASS}>
                  <div className="flex items-center justify-between gap-1.5">
                    {row.hasAccount ? (
                      row.accountActive === false ? (
                        <Badge variant="outline" size="sm" className={cn(TONE_CLASSES.rejected.chip)}>
                          Akun nonaktif
                        </Badge>
                      ) : (
                        <Badge variant="approved" size="sm">
                          Akun aktif
                        </Badge>
                      )
                    ) : canManageRegistry ? (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() =>
                          onCreateAccount({
                            id: row.id,
                            nik: row.nik,
                            fullName: row.fullName,
                            hasAccount: false,
                            accountActive: null,
                          })
                        }
                      >
                        <KeyRound aria-hidden />
                        Buat akun
                      </Button>
                    ) : (
                      <span className="text-[10px] text-fg-subtle">Belum ada</span>
                    )}

                    {canManageRegistry ? (
                      <RowActions
                        label={`Aksi untuk penduduk ${row.fullName}`}
                        subject={formatNik(row.nik)}
                        actions={[
                          {
                            id: "account",
                            label: row.hasAccount ? "Kelola akun portal" : "Buat akun portal",
                            icon: KeyRound,
                            disabled: statusBusy,
                            onSelect: () =>
                              onCreateAccount({
                                id: row.id,
                                nik: row.nik,
                                fullName: row.fullName,
                                hasAccount: row.hasAccount,
                                accountActive: row.accountActive,
                              }),
                          },
                          {
                            id: "edit",
                            label: "Ubah data",
                            icon: PencilLine,
                            onSelect: () => onEditResident(row),
                          },
                          {
                            id: "status",
                            label: "Ubah status kependudukan",
                            icon: UserCog,
                            items: RESIDENT_STATUS_ORDER.map((value) => ({
                              id: value,
                              label: `${RESIDENT_STATUS[value].label}${row.status === value ? " (saat ini)" : ""}`,
                              disabled: row.status === value || statusBusy,
                              onSelect: () => onStatusChange(row, value),
                            })),
                          },
                          {
                            id: "delete",
                            label: "Hapus penduduk",
                            icon: Trash2,
                            tone: "danger" as const,
                            onSelect: () => onDeleteResident(row),
                          },
                        ]}
                      />
                    ) : null}
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
  { key: "actions", label: "Aksi", width: "w-[64px]" },
] as const;

function FamilyTable({
  rows,
  loading,
  canManageRegistry,
  onOpenDetail,
  onDeleteFamily,
}: {
  rows: FamilyRow[];
  loading: boolean;
  canManageRegistry: boolean;
  onOpenDetail: (familyId: string) => void;
  onDeleteFamily: (family: FamilyRow) => void;
}) {
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
              <tr
                key={row.id}
                className="h-9 cursor-pointer border-b border-line transition-colors hover:bg-surface-muted"
                onClick={() => onOpenDetail(row.id)}
              >
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
                <td className={TD_CLASS} onClick={(event) => event.stopPropagation()}>
                  {canManageRegistry ? (
                    <RowActions
                      label={`Aksi untuk Kartu Keluarga ${formatKk(row.kkNumber)}`}
                      subject={`${row.headName} · ${formatKk(row.kkNumber)}`}
                      actions={[
                        {
                          id: "detail",
                          label: "Lihat detail",
                          icon: IdCard,
                          onSelect: () => onOpenDetail(row.id),
                        },
                        {
                          id: "delete",
                          label: "Hapus kartu keluarga",
                          icon: Trash2,
                          tone: "danger" as const,
                          onSelect: () => onDeleteFamily(row),
                        },
                      ]}
                    />
                  ) : (
                    <span className="text-[10px] text-fg-subtle">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      )}
    </TableFrame>
  );
}