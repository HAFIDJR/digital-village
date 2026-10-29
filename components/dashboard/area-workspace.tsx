"use client";

import {
  CircleAlert,
  Home,
  IdCard,
  LoaderCircle,
  MapPin,
  MessageSquareWarning,
  PencilLine,
  Plus,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Panel, PanelHeader, Select } from "@/components/ui/primitives";
import type { HamletArea, NeighborhoodArea } from "@/db/queries";
import type { StaffRole } from "@/db/schema";
import { ROLE_CAPABILITIES } from "@/lib/domain";
import { formatNumber } from "@/lib/format";
import {
  hamletDraftSchema,
  hamletUpdateSchema,
  neighborhoodDraftSchema,
  neighborhoodUpdateSchema,
} from "@/lib/validators";
import { cn } from "@/lib/utils";
import {
  errorFields,
  errorMessage,
  useCreateHamletMutation,
  useCreateNeighborhoodMutation,
  useDeleteHamletMutation,
  useDeleteNeighborhoodMutation,
  useGetShellQuery,
  useListAreasQuery,
  useUpdateHamletMutation,
  useUpdateNeighborhoodMutation,
} from "@/store/api";
import { useAppDispatch } from "@/store";

import { ConfirmDialog } from "./confirm-dialog";
import { QueryErrorState, toastFromMutation } from "./feedback";
import { RowActions } from "./row-actions";
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

function splitHamletName(name: string) {
  const index = name.indexOf(" - ");
  if (index === -1) return { label: name, keterangan: "" };
  return { label: name.slice(0, index), keterangan: name.slice(index + 3) };
}

function fieldIssues(error: unknown) {
  const fieldErrors: Record<string, string[]> = {};
  const issues = (error as { issues?: { path: (string | number)[]; message: string }[] })?.issues;
  for (const issue of issues ?? []) {
    const key = issue.path.join(".") || "_form";
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }
  return fieldErrors;
}

type HamletDialogState =
  | { mode: "create" }
  | { mode: "edit"; hamlet: HamletArea }
  | null;

type NeighborhoodDialogState =
  | { mode: "create"; hamletId?: string }
  | { mode: "edit"; neighborhood: NeighborhoodArea }
  | null;

type DeleteTarget =
  | { kind: "hamlet"; row: HamletArea }
  | { kind: "neighborhood"; row: NeighborhoodArea }
  | null;

export function AreaWorkspace() {
  const { data, isLoading, isError, error, refetch } = useListAreasQuery();
  const shell = useGetShellQuery();

  const [hamletDialog, setHamletDialog] = React.useState<HamletDialogState>(null);
  const [neighborhoodDialog, setNeighborhoodDialog] =
    React.useState<NeighborhoodDialogState>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<DeleteTarget>(null);

  const canManageArea = shell.data?.officer
    ? (ROLE_CAPABILITIES[shell.data.officer.role as StaffRole]?.manageArea ?? false)
    : false;

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
          <>
            <span className="tnum text-2xs text-fg-subtle">
              {formatNumber(hamlets.length)} dusun · {formatNumber(neighborhoods.length)} RT
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              aria-label="Muat ulang data wilayah"
            >
              Segarkan
            </Button>
            {canManageArea ? (
              <Button variant="primary" size="sm" onClick={() => setHamletDialog({ mode: "create" })}>
                <Plus aria-hidden />
                Tambah Dusun
              </Button>
            ) : null}
          </>
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
        <TableFrame caption="Rekap wilayah per dusun" minWidthClass="min-w-[940px]" busy={isLoading}>
          <thead>
            <tr>
              <th scope="col" className={cn(TH_CLASS, "w-52.5")}>Dusun</th>
              <th scope="col" className={cn(TH_CLASS, "w-50")}>Kepala Dusun</th>
              <th scope="col" className={cn(TH_CLASS, "w-27.5")}>RT</th>
              <th scope="col" className={cn(TH_CLASS, "w-30")}>Penduduk</th>
              <th scope="col" className={cn(TH_CLASS, "w-27.5")}>KK</th>
              <th scope="col" className={cn(TH_CLASS, "w-32.5")}>Laporan</th>
              <th scope="col" className={cn(TH_CLASS, "w-32.5")}>Pengajuan</th>
              {canManageArea ? (
                <th scope="col" className={cn(TH_CLASS, "w-16")}>Aksi</th>
              ) : null}
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
                { key: "h", width: "w-8" },
              ]}
              label="Memuat data wilayah…"
              rows={4}
            />
          ) : hamlets.length === 0 ? (
            <tbody>
              <TableEmpty
                colSpan={canManageArea ? 8 : 7}
                title="Data wilayah belum tersedia"
                message={
                  canManageArea
                    ? "Tambahkan dusun pertama untuk mulai memetakan wilayah desa."
                    : "Dusun dan RT/RW akan muncul setelah pemetaan wilayah desa diunggah."
                }
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
                  {canManageArea ? (
                    <td className={TD_CLASS}>
                      <RowActions
                        label={`Aksi untuk Dusun ${hamlet.name}`}
                        subject={`${hamlet.code} · ${hamlet.name}`}
                        actions={[
                          {
                            id: "edit",
                            label: "Ubah dusun",
                            icon: PencilLine,
                            onSelect: () => setHamletDialog({ mode: "edit", hamlet }),
                          },
                          {
                            id: "add-rt",
                            label: "Tambah RT/RW di dusun ini",
                            icon: Plus,
                            onSelect: () =>
                              setNeighborhoodDialog({ mode: "create", hamletId: hamlet.id }),
                          },
                          {
                            id: "delete",
                            label: "Hapus dusun",
                            icon: Trash2,
                            tone: "danger" as const,
                            onSelect: () => setDeleteTarget({ kind: "hamlet", row: hamlet }),
                          },
                        ]}
                      />
                    </td>
                  ) : null}
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
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" size="sm">
                <IdCard className="size-3" aria-hidden />
                {formatNumber(neighborhoods.length)} wilayah
              </Badge>
              {canManageArea ? (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setNeighborhoodDialog({ mode: "create" })}
                >
                  <Plus aria-hidden />
                  Tambah RT/RW
                </Button>
              ) : null}
            </div>
          }
        />
        <TableFrame caption="Daftar RT dan RW" minWidthClass="min-w-[880px]" busy={isLoading}>
          <thead>
            <tr>
              <th scope="col" className={cn(TH_CLASS, "w-50")}>Dusun</th>
              <th scope="col" className={cn(TH_CLASS, "w-35")}>RT / RW</th>
              <th scope="col" className={cn(TH_CLASS, "w-55")}>Ketua RT</th>
              <th scope="col" className={cn(TH_CLASS, "w-32.5")}>Penduduk</th>
              <th scope="col" className={cn(TH_CLASS, "w-30")}>KK</th>
              {canManageArea ? (
                <th scope="col" className={cn(TH_CLASS, "w-16")}>Aksi</th>
              ) : null}
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
                { key: "f", width: "w-8" },
              ]}
              label="Memuat daftar RT/RW…"
            />
          ) : neighborhoods.length === 0 ? (
            <tbody>
              <TableEmpty
                colSpan={canManageArea ? 6 : 5}
                title="Belum ada RT/RW terdaftar"
                message={
                  canManageArea
                    ? "Tambahkan wilayah rukun tetangga pertama di salah satu dusun."
                    : "Wilayah rukun tetangga akan muncul setelah pemetaan wilayah desa diunggah."
                }
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
                  {canManageArea ? (
                    <td className={TD_CLASS}>
                      <RowActions
                        label={`Aksi untuk RT ${String(entry.rt).padStart(2, "0")}/RW ${String(entry.rw).padStart(2, "0")} ${entry.hamlet}`}
                        subject={`${entry.hamlet} · RT ${String(entry.rt).padStart(2, "0")}/RW ${String(entry.rw).padStart(2, "0")}`}
                        actions={[
                          {
                            id: "edit",
                            label: "Ubah RT/RW",
                            icon: PencilLine,
                            onSelect: () =>
                              setNeighborhoodDialog({ mode: "edit", neighborhood: entry }),
                          },
                          {
                            id: "delete",
                            label: "Hapus RT/RW",
                            icon: Trash2,
                            tone: "danger" as const,
                            onSelect: () => setDeleteTarget({ kind: "neighborhood", row: entry }),
                          },
                        ]}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          )}
        </TableFrame>
      </Panel>

      <HamletDialog
        key={
          hamletDialog
            ? hamletDialog.mode === "edit"
              ? `hamlet-edit-${hamletDialog.hamlet.id}`
              : "hamlet-create"
            : "hamlet-closed"
        }
        state={hamletDialog}
        onOpenChange={(open) => {
          if (!open) setHamletDialog(null);
        }}
      />
      <NeighborhoodDialog
        key={
          neighborhoodDialog
            ? neighborhoodDialog.mode === "edit"
              ? `rt-edit-${neighborhoodDialog.neighborhood.id}`
              : `rt-create-${neighborhoodDialog.hamletId ?? "any"}`
            : "rt-closed"
        }
        state={neighborhoodDialog}
        hamlets={hamlets}
        onOpenChange={(open) => {
          if (!open) setNeighborhoodDialog(null);
        }}
      />
      <AreaDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

function HamletDialog({
  state,
  onOpenChange,
}: {
  state: HamletDialogState;
  onOpenChange: (open: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const [createHamlet, createState] = useCreateHamletMutation();
  const [updateHamlet, updateState] = useUpdateHamletMutation();

  const isEdit = state?.mode === "edit";
  const open = state !== null;

  const seedParts = state?.mode === "edit" ? splitHamletName(state.hamlet.name) : null;
  const [label, setLabel] = React.useState(seedParts?.label ?? "");
  const [keterangan, setKeterangan] = React.useState(seedParts?.keterangan ?? "");
  const [code, setCode] = React.useState(state?.mode === "edit" ? state.hamlet.code : "");
  const [headName, setHeadName] = React.useState(
    state?.mode === "edit" ? (state.hamlet.headName ?? "") : "",
  );
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  const pending = createState.isLoading || updateState.isLoading;
  const activeError = isEdit ? updateState : createState;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!state) return;
    setErrors({});

    const name = keterangan.trim() ? `${label.trim()} - ${keterangan.trim()}` : label.trim();

    if (state.mode === "edit") {
      // Only send what actually changed — an untouched save is a local no-op.
      const patch: { name?: string; code?: string; headName?: string | null } = {};
      if (name !== state.hamlet.name) patch.name = name;
      if (code !== state.hamlet.code) patch.code = code;
      const nextHead = headName.trim() || null;
      if (nextHead !== (state.hamlet.headName ?? null)) patch.headName = nextHead;
      if (!Object.keys(patch).length) {
        setErrors({ _form: ["Tidak ada data yang diubah."] });
        return;
      }

      const parsed = hamletUpdateSchema.safeParse(patch);
      if (!parsed.success) {
        setErrors(fieldIssues(parsed.error));
        return;
      }
      try {
        const result = await updateHamlet({ id: state.hamlet.id, body: parsed.data }).unwrap();
        toastFromMutation(dispatch, {
          tone: "success",
          title: "Dusun diperbarui",
          body: `Dusun ${result.hamlet.name} (${result.hamlet.code}) tersimpan.`,
        });
        onOpenChange(false);
      } catch (error) {
        setErrors(errorFields(error));
      }
      return;
    }

    const parsed = hamletDraftSchema.safeParse({
      name,
      code,
      headName: headName.trim() || undefined,
    });
    if (!parsed.success) {
      setErrors(fieldIssues(parsed.error));
      return;
    }
    try {
      const result = await createHamlet(parsed.data).unwrap();
      toastFromMutation(dispatch, {
        tone: "success",
        title: "Dusun ditambahkan",
        body: `Dusun ${result.hamlet.name} (${result.hamlet.code}) masuk ke peta wilayah desa.`,
      });
      onOpenChange(false);
    } catch (error) {
      setErrors(errorFields(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        labelledBy="hamlet-form-title"
        describedBy="hamlet-form-desc"
        className="max-w-md p-5"
      >
        <form onSubmit={submit} noValidate>
          <div className="mb-4 flex items-start gap-2.5 pr-6">
            <span className="grid size-8 shrink-0 place-items-center rounded-sm border border-civic/25 bg-civic-soft text-civic">
              <MapPin className="size-4" aria-hidden />
            </span>
            <div>
              <h2
                id="hamlet-form-title"
                className="font-display text-sm font-bold tracking-[-0.01em] text-fg"
              >
                {isEdit ? "Ubah Dusun" : "Tambah Dusun"}
              </h2>
              <p id="hamlet-form-desc" className="mt-0.5 text-2xs leading-4 text-fg-subtle">
                {isEdit
                  ? "Perubahan nama atau kode dusun ikut mengubah alamat yang tercetak pada surat dan laporan."
                  : "Dusun baru langsung tersedia sebagai tujuan penempatan penduduk dan RT/RW."}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Field label="Nama dusun" htmlFor="hamlet-label" required error={errors.name?.[0]}>
              <Input
                id="hamlet-label"
                value={label}
                maxLength={60}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Contoh: Dusun 01"
                aria-invalid={Boolean(errors.name)}
              />
            </Field>

            <Field
              label="Keterangan (nama wilayah)"
              htmlFor="hamlet-keterangan"
              error={errors.name?.[1]}
              hint="Digabung menjadi “Nama dusun - Keterangan” pada daftar wilayah."
            >
              <Input
                id="hamlet-keterangan"
                value={keterangan}
                maxLength={60}
                onChange={(event) => setKeterangan(event.target.value)}
                placeholder="Contoh: Cikembang"
              />
            </Field>

            <Field
              label="Kode dusun"
              htmlFor="hamlet-code"
              required
              error={errors.code?.[0]}
              hint="Huruf kapital, angka, dan tanda hubung. Harus unik."
            >
              <Input
                id="hamlet-code"
                value={code}
                maxLength={16}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="Contoh: DSN-01"
                className="font-mono"
                aria-invalid={Boolean(errors.code)}
              />
            </Field>

            <Field label="Kepala dusun" htmlFor="hamlet-head" error={errors.headName?.[0]}>
              <Input
                id="hamlet-head"
                value={headName}
                maxLength={120}
                onChange={(event) => setHeadName(event.target.value)}
                placeholder="Contoh: Ujang Suhendar"
                aria-invalid={Boolean(errors.headName)}
              />
            </Field>
          </div>

          {errors._form?.length || activeError.isError ? (
            <p
              role="alert"
              className="mt-3 flex items-start gap-1.5 rounded-sm border border-rejected-line/60 bg-rejected-bg px-2.5 py-2 text-2xs text-rejected"
            >
              <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {errors._form?.[0] ?? errorMessage(activeError.error)}
            </p>
          ) : null}

          <div className="mt-4 flex items-center justify-end gap-1.5 border-t border-line pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
              Batal
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              {isEdit ? "Simpan perubahan" : "Tambah dusun"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NeighborhoodDialog({
  state,
  hamlets,
  onOpenChange,
}: {
  state: NeighborhoodDialogState;
  hamlets: HamletArea[];
  onOpenChange: (open: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const [createNeighborhood, createState] = useCreateNeighborhoodMutation();
  const [updateNeighborhood, updateState] = useUpdateNeighborhoodMutation();

  const isEdit = state?.mode === "edit";
  const open = state !== null;
  const editRow = state?.mode === "edit" ? state.neighborhood : null;
  const [hamletId, setHamletId] = React.useState(
    editRow?.hamletId ?? (state?.mode === "create" ? (state.hamletId ?? "") : ""),
  );
  const [rt, setRt] = React.useState(editRow ? String(editRow.rt) : "");
  const [rw, setRw] = React.useState(editRow ? String(editRow.rw) : "");
  const [headName, setHeadName] = React.useState(editRow?.headName ?? "");
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  const pending = createState.isLoading || updateState.isLoading;
  const activeError = isEdit ? updateState : createState;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!state) return;
    setErrors({});

    if (state.mode === "edit") {
      // Only send what actually changed — an untouched save is a local no-op.
      const patch: {
        hamletId?: string;
        rt?: string;
        rw?: string;
        headName?: string | null;
      } = {};
      if (hamletId !== state.neighborhood.hamletId) patch.hamletId = hamletId;
      if (Number(rt) !== state.neighborhood.rt) patch.rt = rt;
      if (Number(rw) !== state.neighborhood.rw) patch.rw = rw;
      const nextHead = headName.trim() || null;
      if (nextHead !== (state.neighborhood.headName ?? null)) patch.headName = nextHead;
      if (!Object.keys(patch).length) {
        setErrors({ _form: ["Tidak ada data yang diubah."] });
        return;
      }

      const parsed = neighborhoodUpdateSchema.safeParse(patch);
      if (!parsed.success) {
        setErrors(fieldIssues(parsed.error));
        return;
      }
      try {
        const result = await updateNeighborhood({ id: state.neighborhood.id, body: parsed.data }).unwrap();
        const hamletLabel = hamlets.find((row) => row.id === result.neighborhood.hamletId);
        toastFromMutation(dispatch, {
          tone: "success",
          title: "Wilayah RT/RW diperbarui",
          body: `RT ${String(result.neighborhood.rt).padStart(2, "0")}/RW ${String(result.neighborhood.rw).padStart(2, "0")}${hamletLabel ? ` di ${hamletLabel.name.split(" - ")[0]}` : ""} tersimpan.`,
        });
        onOpenChange(false);
      } catch (error) {
        setErrors(errorFields(error));
      }
      return;
    }

    const parsed = neighborhoodDraftSchema.safeParse({
      hamletId,
      rt,
      rw,
      headName: headName.trim() || undefined,
    });
    if (!parsed.success) {
      setErrors(fieldIssues(parsed.error));
      return;
    }
    try {
      const result = await createNeighborhood(parsed.data).unwrap();
      const hamletLabel = hamlets.find((row) => row.id === result.neighborhood.hamletId);
      toastFromMutation(dispatch, {
        tone: "success",
        title: "Wilayah RT/RW ditambahkan",
        body: `RT ${String(result.neighborhood.rt).padStart(2, "0")}/RW ${String(result.neighborhood.rw).padStart(2, "0")}${hamletLabel ? ` di ${hamletLabel.name.split(" - ")[0]}` : ""} masuk ke peta wilayah.`,
      });
      onOpenChange(false);
    } catch (error) {
      setErrors(errorFields(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        labelledBy="neighborhood-form-title"
        describedBy="neighborhood-form-desc"
        className="max-w-md p-5"
      >
        <form onSubmit={submit} noValidate>
          <div className="mb-4 flex items-start gap-2.5 pr-6">
            <span className="grid size-8 shrink-0 place-items-center rounded-sm border border-civic/25 bg-civic-soft text-civic">
              <Home className="size-4" aria-hidden />
            </span>
            <div>
              <h2
                id="neighborhood-form-title"
                className="font-display text-sm font-bold tracking-[-0.01em] text-fg"
              >
                {isEdit ? "Ubah RT/RW" : "Tambah RT/RW"}
              </h2>
              <p id="neighborhood-form-desc" className="mt-0.5 text-2xs leading-4 text-fg-subtle">
                {isEdit
                  ? "Memindahkan RT/RW ke dusun lain mengubah alamat seluruh penduduk di dalamnya dan memberi tahu perangkat desa."
                  : "Kombinasi RT/RW harus unik di dalam satu dusun."}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Field label="Dusun" htmlFor="neighborhood-hamlet" required error={errors.hamletId?.[0]}>
              <Select
                id="neighborhood-hamlet"
                value={hamletId}
                onChange={(event) => setHamletId(event.target.value)}
                aria-invalid={Boolean(errors.hamletId)}
              >
                <option value="">— Pilih dusun —</option>
                {hamlets.map((hamlet) => (
                  <option key={hamlet.id} value={hamlet.id}>
                    {hamlet.name} ({hamlet.code})
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Nomor RT" htmlFor="neighborhood-rt" required error={errors.rt?.[0]}>
                <Input
                  id="neighborhood-rt"
                  value={rt}
                  inputMode="numeric"
                  maxLength={2}
                  onChange={(event) => setRt(event.target.value.replace(/\D/g, "").slice(0, 2))}
                  placeholder="01"
                  className="tnum"
                  aria-invalid={Boolean(errors.rt)}
                />
              </Field>
              <Field label="Nomor RW" htmlFor="neighborhood-rw" required error={errors.rw?.[0]}>
                <Input
                  id="neighborhood-rw"
                  value={rw}
                  inputMode="numeric"
                  maxLength={2}
                  onChange={(event) => setRw(event.target.value.replace(/\D/g, "").slice(0, 2))}
                  placeholder="03"
                  className="tnum"
                  aria-invalid={Boolean(errors.rw)}
                />
              </Field>
            </div>

            <Field label="Ketua RT" htmlFor="neighborhood-head" error={errors.headName?.[0]}>
              <Input
                id="neighborhood-head"
                value={headName}
                maxLength={120}
                onChange={(event) => setHeadName(event.target.value)}
                placeholder="Contoh: Dedi Kurniawan"
                aria-invalid={Boolean(errors.headName)}
              />
            </Field>
          </div>

          {errors._form?.length || activeError.isError ? (
            <p
              role="alert"
              className="mt-3 flex items-start gap-1.5 rounded-sm border border-rejected-line/60 bg-rejected-bg px-2.5 py-2 text-2xs text-rejected"
            >
              <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {errors._form?.[0] ?? errorMessage(activeError.error)}
            </p>
          ) : null}

          <div className="mt-4 flex items-center justify-end gap-1.5 border-t border-line pt-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
              Batal
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Save aria-hidden />}
              {isEdit ? "Simpan perubahan" : "Tambah RT/RW"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Delete confirmation                                                         */
/* -------------------------------------------------------------------------- */

function AreaDeleteDialog({
  target,
  onClose,
}: {
  target: DeleteTarget;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const [deleteHamlet, hamletState] = useDeleteHamletMutation();
  const [deleteNeighborhood, neighborhoodState] = useDeleteNeighborhoodMutation();

  const loading = hamletState.isLoading || neighborhoodState.isLoading;
  const activeError = target?.kind === "hamlet" ? hamletState : neighborhoodState;

  const confirm = async () => {
    if (!target) return;
    try {
      if (target.kind === "hamlet") {
        const result = await deleteHamlet(target.row.id).unwrap();
        toastFromMutation(dispatch, {
          tone: "success",
          title: "Dusun dihapus",
          body: `Dusun ${result.hamlet.name.split(" - ")[0]} (${result.hamlet.code}) dikeluarkan dari peta wilayah.`,
        });
      } else {
        const result = await deleteNeighborhood(target.row.id).unwrap();
        toastFromMutation(dispatch, {
          tone: "success",
          title: "Wilayah RT/RW dihapus",
          body: `RT ${String(result.neighborhood.rt).padStart(2, "0")}/RW ${String(result.neighborhood.rw).padStart(2, "0")} dikeluarkan dari peta wilayah.`,
        });
      }
      onClose();
    } catch {
      // The dialog keeps the server message inline (e.g. AREA_IN_USE).
    }
  };

  if (!target) return null;

  if (target.kind === "hamlet") {
    const row = target.row;
    return (
      <ConfirmDialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        tone="danger"
        icon={Trash2}
        title="Hapus dusun?"
        description="Dusun hanya dapat dihapus bila sudah tidak menaungi RT/RW, penduduk, kartu keluarga, atau pengajuan surat. Perangkat desa lain akan diberi tahu."
        details={
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-fg-subtle">Dusun</dt>
            <dd className="font-medium text-fg">{row.name}</dd>
            <dt className="text-fg-subtle">Kode</dt>
            <dd className="font-mono text-fg">{row.code}</dd>
            <dt className="text-fg-subtle">RT/RW</dt>
            <dd className="tnum text-fg">{row.neighborhoodCount} wilayah</dd>
            <dt className="text-fg-subtle">Penduduk / KK</dt>
            <dd className="tnum text-fg">
              {formatNumber(row.residents)} jiwa · {formatNumber(row.families)} KK
            </dd>
          </dl>
        }
        confirmLabel="Hapus dusun"
        loading={loading}
        error={activeError.isError ? errorMessage(activeError.error) : null}
        onConfirm={confirm}
      />
    );
  }

  const row = target.row;
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      tone="danger"
      icon={Trash2}
      title="Hapus wilayah RT/RW?"
      description="RT/RW hanya dapat dihapus bila tidak ada penduduk, kartu keluarga, atau pengajuan surat yang beralamat di sana. Perangkat desa lain akan diberi tahu."
      details={
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-fg-subtle">Wilayah</dt>
          <dd className="tnum font-mono font-medium text-fg">
            RT {String(row.rt).padStart(2, "0")}/RW {String(row.rw).padStart(2, "0")}
          </dd>
          <dt className="text-fg-subtle">Dusun</dt>
          <dd className="text-fg">{row.hamlet}</dd>
          <dt className="text-fg-subtle">Penduduk / KK</dt>
          <dd className="tnum text-fg">
            {formatNumber(row.residents)} jiwa · {formatNumber(row.families)} KK
          </dd>
        </dl>
      }
      confirmLabel="Hapus RT/RW"
      loading={loading}
      error={activeError.isError ? errorMessage(activeError.error) : null}
      onConfirm={confirm}
    />
  );
}