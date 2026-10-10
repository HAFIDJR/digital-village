"use client";

import {
  CircleAlert,
  LoaderCircle,
  Save,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/primitives";
import { WELFARE_CLASS_ORDER } from "@/lib/domain";
import { formatKk, formatNik } from "@/lib/format";
import { cn } from "@/lib/utils";
import { familyDraftSchema, type FamilyDraft } from "@/lib/validators";
import type { ResidentRow } from "@/db/queries";
import {
  errorFields,
  errorMessage,
  useCreateFamilyMutation,
  useListAreasQuery,
  useListRegistryQuery,
} from "@/store/api";
import { useAppDispatch } from "@/store";

import { toastFromMutation } from "../feedback";

const EMPTY_FORM = {
  kkNumber: "",
  headName: "",
  neighborhoodId: "",
  address: "",
  welfareClass: "Sejahtera I",
};

/**
 * "Tambah Kartu Keluarga" — opens a KK and moves the searched residents into it
 * in the same write, so `member_count` is never out of step with the registry.
 */
export function FamilyFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const areas = useListAreasQuery(undefined, { skip: !open });
  const [createFamily, createState] = useCreateFamilyMutation();

  const [form, setForm] = React.useState(EMPTY_FORM);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [memberQuery, setMemberQuery] = React.useState("");
  const [members, setMembers] = React.useState<ResidentRow[]>([]);

  const search = useListRegistryQuery(
    { type: "residents", q: memberQuery, pageSize: 10 },
    { skip: !open || memberQuery.trim().length < 2 },
  );

  const set = <K extends keyof typeof EMPTY_FORM>(
    key: K,
    value: (typeof EMPTY_FORM)[K],
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  };

  const addMember = (resident: ResidentRow) => {
    setMembers((current) =>
      current.some((row) => row.id === resident.id)
        ? current
        : [...current, resident],
    );
    setMemberQuery("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});

    const draft: FamilyDraft = {
      kkNumber: form.kkNumber,
      headName: form.headName,
      neighborhoodId: form.neighborhoodId,
      address: form.address,
      welfareClass: form.welfareClass,
      memberIds: members.map((member) => member.id),
    };

    const parsed = familyDraftSchema.safeParse(draft);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_form";
        fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
      }
      setErrors(fieldErrors);
      return;
    }

    try {
      const result = await createFamily(parsed.data).unwrap();
      toastFromMutation(dispatch, {
        tone: "success",
        title: "Kartu keluarga diterbitkan",
        body: `KK ${formatKk(result.family.kkNumber)} atas nama ${result.family.headName} dengan ${result.family.memberCount} anggota.`,
      });
      onOpenChange(false);
    } catch (error) {
      setErrors(errorFields(error));
    }
  };

  const candidates = ((search.data?.rows as ResidentRow[] | undefined) ?? []).filter(
    (row) => !members.some((member) => member.id === row.id),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        labelledBy="family-form-title"
        describedBy="family-form-desc"
        className="max-h-[88vh] max-w-2xl overflow-y-auto"
      >
        <form onSubmit={submit} noValidate>
          <div className="mb-4 flex items-start gap-2.5 pr-6">
            <span className="grid size-8 shrink-0 place-items-center rounded-sm border border-civic/25 bg-civic-soft text-civic">
              <Users className="size-4" aria-hidden />
            </span>
            <div>
              <h2
                id="family-form-title"
                className="font-display text-sm font-bold tracking-[-0.01em] text-fg"
              >
                Tambah Kartu Keluarga
              </h2>
              <p
                id="family-form-desc"
                className="mt-0.5 text-2xs leading-4 text-fg-subtle"
              >
                Nomor KK harus unik. Anggota yang dipilih dipindahkan ke kartu
                keluarga ini dan jumlah anggota diperbarui otomatis.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Nomor Kartu Keluarga"
              htmlFor="family-kk"
              required
              error={errors.kkNumber?.[0]}
              hint="16 digit angka."
            >
              <Input
                id="family-kk"
                value={form.kkNumber}
                inputMode="numeric"
                maxLength={16}
                onChange={(event) =>
                  set("kkNumber", event.target.value.replace(/\D/g, "").slice(0, 16))
                }
                placeholder="3204160101000123"
                className="tnum font-mono"
                aria-invalid={Boolean(errors.kkNumber)}
              />
            </Field>

            <Field
              label="Nama kepala keluarga"
              htmlFor="family-head"
              required
              error={errors.headName?.[0]}
            >
              <Input
                id="family-head"
                value={form.headName}
                maxLength={120}
                onChange={(event) => set("headName", event.target.value)}
                placeholder="Contoh: Asep Suryana"
                aria-invalid={Boolean(errors.headName)}
              />
            </Field>

            <Field
              label="Wilayah RT/RW"
              htmlFor="family-neighborhood"
              required
              error={errors.neighborhoodId?.[0]}
            >
              <Select
                id="family-neighborhood"
                value={form.neighborhoodId}
                onChange={(event) => set("neighborhoodId", event.target.value)}
                aria-invalid={Boolean(errors.neighborhoodId)}
              >
                <option value="">
                  {areas.isLoading ? "Memuat wilayah…" : "— Pilih dusun & RT/RW —"}
                </option>
                {(areas.data?.neighborhoods ?? []).map((neighborhood) => (
                  <option key={neighborhood.id} value={neighborhood.id}>
                    {neighborhood.hamlet.split(" - ")[0]} · RT{" "}
                    {String(neighborhood.rt).padStart(2, "0")}/RW{" "}
                    {String(neighborhood.rw).padStart(2, "0")}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Klasifikasi kesejahteraan"
              htmlFor="family-welfare"
              required
              error={errors.welfareClass?.[0]}
              hint="Dipakai untuk pemetaan bantuan sosial desa."
            >
              <Select
                id="family-welfare"
                value={form.welfareClass}
                onChange={(event) => set("welfareClass", event.target.value)}
              >
                {WELFARE_CLASS_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Alamat"
              htmlFor="family-address"
              required
              error={errors.address?.[0]}
              className="sm:col-span-2"
            >
              <Input
                id="family-address"
                value={form.address}
                maxLength={400}
                onChange={(event) => set("address", event.target.value)}
                placeholder="Contoh: Kp. Babakan No. 8"
                aria-invalid={Boolean(errors.address)}
              />
            </Field>
          </div>

          {/* --- members ------------------------------------------------- */}
          <div className="mt-3 rounded-sm border border-line bg-surface-muted p-2.5">
            <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
              Anggota kartu keluarga
            </p>

            {members.length ? (
              <ul className="mt-2 space-y-1">
                {members.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center justify-between gap-2 rounded-xs border border-line bg-surface px-2 py-1.5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-2xs font-medium text-fg">
                        {member.fullName}
                      </span>
                      <span className="tnum block font-mono text-[10px] text-fg-subtle">
                        {formatNik(member.nik)} · {member.familyRelation ?? "—"}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        setMembers((current) =>
                          current.filter((row) => row.id !== member.id),
                        )
                      }
                      aria-label={`Keluarkan ${member.fullName} dari daftar anggota`}
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-2xs text-fg-subtle">
                Belum ada anggota. Kartu keluarga dapat diterbitkan tanpa anggota
                dan dilengkapi kemudian.
              </p>
            )}

            <div className="mt-2 flex items-center gap-1.5">
              <Search className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
              <Input
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
                placeholder="Cari nama atau NIK untuk menambahkan anggota…"
                aria-label="Cari penduduk untuk ditambahkan sebagai anggota"
              />
            </div>

            {memberQuery.trim().length >= 2 ? (
              search.isLoading ? (
                <p className="mt-2 text-2xs text-fg-subtle">Mencari penduduk…</p>
              ) : candidates.length === 0 ? (
                <p className="mt-2 text-2xs text-fg-subtle">
                  Tidak ada penduduk yang cocok.
                </p>
              ) : (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {candidates.slice(0, 8).map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => addMember(row)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-xs border border-line bg-surface px-2 py-1.5 text-left",
                          "transition-colors hover:border-civic hover:bg-civic-soft",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-2xs font-medium text-fg">
                            {row.fullName}
                          </span>
                          <span className="tnum block font-mono text-[10px] text-fg-subtle">
                            {formatNik(row.nik)} · {row.dusun} RT{" "}
                            {String(row.rt).padStart(2, "0")}/RW{" "}
                            {String(row.rw).padStart(2, "0")}
                          </span>
                        </span>
                        <UserPlus className="size-3.5 shrink-0 text-civic" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>

          {errors._form?.length || createState.isError ? (
            <p
              role="alert"
              className="mt-3 flex items-start gap-1.5 rounded-sm border border-rejected-line/60 bg-rejected-bg px-2.5 py-2 text-2xs text-rejected"
            >
              <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {errors._form?.[0] ?? errorMessage(createState.error)}
            </p>
          ) : null}

          <div className="mt-4 flex items-center justify-end gap-1.5 border-t border-line pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={createState.isLoading}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={createState.isLoading}
            >
              {createState.isLoading ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <Save aria-hidden />
              )}
              Simpan kartu keluarga
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
