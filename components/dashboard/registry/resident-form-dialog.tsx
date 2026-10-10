"use client";

import { CircleAlert, LoaderCircle, Save, UserPlus } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Checkbox,
  Field,
  Input,
  Select,
} from "@/components/ui/primitives";
import {
  EDUCATION_LEVEL,
  EDUCATION_LEVEL_ORDER,
  FAMILY_RELATION,
  FAMILY_RELATION_ORDER,
  GENDER_LABEL,
  MARITAL_STATUS_LABEL,
  RELIGION_LABEL,
} from "@/lib/domain";
import { residentDraftSchema, type ResidentDraft } from "@/lib/validators";
import {
  errorFields,
  errorMessage,
  useCreateResidentMutation,
  useListAreasQuery,
} from "@/store/api";
import { useAppDispatch } from "@/store";

import { toastFromMutation } from "../feedback";

const EMPTY_FORM = {
  nik: "",
  fullName: "",
  gender: "" as ResidentDraft["gender"] | "",
  birthPlace: "",
  birthDate: "",
  religion: "ISLAM" as ResidentDraft["religion"],
  maritalStatus: "BELUM_MENIKAH" as ResidentDraft["maritalStatus"],
  education: "",
  occupation: "",
  nationality: "WNI",
  familyRelation: "KEPALA KELUARGA",
  neighborhoodId: "",
  address: "",
  phone: "",
  documentsVerified: false,
};

/**
 * "Tambah Penduduk" — registers a resident with full demographic detail.
 * The NIK is checked for uniqueness on the server and the duplicate surfaces as
 * a field error next to the input.
 */
export function ResidentFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const areas = useListAreasQuery(undefined, { skip: !open });
  const [createResident, createState] = useCreateResidentMutation();

  const [form, setForm] = React.useState(EMPTY_FORM);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});

    const parsed = residentDraftSchema.safeParse({
      ...form,
      education: form.education.trim() || undefined,
      occupation: form.occupation.trim() || undefined,
      phone: form.phone.trim() || undefined,
    });

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
      const result = await createResident(parsed.data).unwrap();
      toastFromMutation(dispatch, {
        tone: "success",
        title: "Penduduk terdaftar",
        body: `${result.resident.fullName} (NIK ${result.resident.nik}) masuk ke register penduduk.`,
      });
      onOpenChange(false);
    } catch (error) {
      setErrors(errorFields(error));
    }
  };

  const neighborhoods = areas.data?.neighborhoods ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        labelledBy="resident-form-title"
        describedBy="resident-form-desc"
        className="max-h-[88vh] max-w-2xl overflow-y-auto"
      >
        <form onSubmit={submit} noValidate>
          <div className="mb-4 flex items-start gap-2.5 pr-6">
            <span className="grid size-8 shrink-0 place-items-center rounded-sm border border-civic/25 bg-civic-soft text-civic">
              <UserPlus className="size-4" aria-hidden />
            </span>
            <div>
              <h2
                id="resident-form-title"
                className="font-display text-sm font-bold tracking-[-0.01em] text-fg"
              >
                Tambah Penduduk
              </h2>
              <p
                id="resident-form-desc"
                className="mt-0.5 text-2xs leading-4 text-fg-subtle"
              >
                Lengkapi identitas sesuai KTP dan kartu keluarga. NIK yang sudah
                terdaftar akan ditolak.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="NIK"
              htmlFor="resident-nik"
              required
              error={errors.nik?.[0]}
              hint="16 digit angka sesuai KTP."
            >
              <Input
                id="resident-nik"
                value={form.nik}
                inputMode="numeric"
                maxLength={16}
                onChange={(event) =>
                  set("nik", event.target.value.replace(/\D/g, "").slice(0, 16))
                }
                placeholder="3204160101801234"
                className="tnum font-mono"
                aria-invalid={Boolean(errors.nik)}
              />
            </Field>

            <Field
              label="Nama lengkap"
              htmlFor="resident-name"
              required
              error={errors.fullName?.[0]}
            >
              <Input
                id="resident-name"
                value={form.fullName}
                maxLength={120}
                onChange={(event) => set("fullName", event.target.value)}
                placeholder="Contoh: Siti Rahmawati"
                aria-invalid={Boolean(errors.fullName)}
              />
            </Field>

            <Field label="Jenis kelamin" htmlFor="resident-gender" required error={errors.gender?.[0]}>
              <Select
                id="resident-gender"
                value={form.gender}
                onChange={(event) =>
                  set("gender", event.target.value as ResidentDraft["gender"])
                }
                aria-invalid={Boolean(errors.gender)}
              >
                <option value="">— Pilih —</option>
                {Object.entries(GENDER_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Tempat lahir"
              htmlFor="resident-birth-place"
              required
              error={errors.birthPlace?.[0]}
            >
              <Input
                id="resident-birth-place"
                value={form.birthPlace}
                maxLength={80}
                onChange={(event) => set("birthPlace", event.target.value)}
                placeholder="Contoh: Bandung"
                aria-invalid={Boolean(errors.birthPlace)}
              />
            </Field>

            <Field
              label="Tanggal lahir"
              htmlFor="resident-birth-date"
              required
              error={errors.birthDate?.[0]}
            >
              <Input
                id="resident-birth-date"
                type="date"
                value={form.birthDate}
                onChange={(event) => set("birthDate", event.target.value)}
                aria-invalid={Boolean(errors.birthDate)}
              />
            </Field>

            <Field label="Agama" htmlFor="resident-religion" error={errors.religion?.[0]}>
              <Select
                id="resident-religion"
                value={form.religion}
                onChange={(event) =>
                  set("religion", event.target.value as ResidentDraft["religion"])
                }
              >
                {Object.entries(RELIGION_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Status perkawinan"
              htmlFor="resident-marital"
              error={errors.maritalStatus?.[0]}
            >
              <Select
                id="resident-marital"
                value={form.maritalStatus}
                onChange={(event) =>
                  set(
                    "maritalStatus",
                    event.target.value as ResidentDraft["maritalStatus"],
                  )
                }
              >
                {Object.entries(MARITAL_STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Hubungan dalam keluarga"
              htmlFor="resident-relation"
              required
              error={errors.familyRelation?.[0]}
            >
              <Select
                id="resident-relation"
                value={form.familyRelation}
                onChange={(event) => set("familyRelation", event.target.value)}
                aria-invalid={Boolean(errors.familyRelation)}
              >
                {FAMILY_RELATION_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {FAMILY_RELATION[value]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Pendidikan terakhir" htmlFor="resident-education">
              <Select
                id="resident-education"
                value={form.education}
                onChange={(event) => set("education", event.target.value)}
              >
                <option value="">— Tidak tercatat —</option>
                {EDUCATION_LEVEL_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {EDUCATION_LEVEL[value]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Pekerjaan" htmlFor="resident-occupation" error={errors.occupation?.[0]}>
              <Input
                id="resident-occupation"
                value={form.occupation}
                maxLength={80}
                onChange={(event) => set("occupation", event.target.value)}
                placeholder="Contoh: Wiraswasta"
              />
            </Field>

            <Field
              label="Kewarganegaraan"
              htmlFor="resident-nationality"
              required
              error={errors.nationality?.[0]}
            >
              <Input
                id="resident-nationality"
                value={form.nationality}
                maxLength={48}
                onChange={(event) => set("nationality", event.target.value)}
              />
            </Field>

            <Field
              label="Nomor HP"
              htmlFor="resident-phone"
              error={errors.phone?.[0]}
              hint="Format 08xx tanpa tanda baca."
            >
              <Input
                id="resident-phone"
                value={form.phone}
                inputMode="tel"
                maxLength={16}
                onChange={(event) =>
                  set("phone", event.target.value.replace(/[^\d+]/g, ""))
                }
                placeholder="081234567890"
                className="tnum font-mono"
                aria-invalid={Boolean(errors.phone)}
              />
            </Field>

            <Field
              label="Wilayah RT/RW"
              htmlFor="resident-neighborhood"
              required
              error={errors.neighborhoodId?.[0]}
              className="sm:col-span-2"
            >
              <Select
                id="resident-neighborhood"
                value={form.neighborhoodId}
                onChange={(event) => set("neighborhoodId", event.target.value)}
                aria-invalid={Boolean(errors.neighborhoodId)}
              >
                <option value="">
                  {areas.isLoading ? "Memuat wilayah…" : "— Pilih dusun & RT/RW —"}
                </option>
                {neighborhoods.map((neighborhood) => (
                  <option key={neighborhood.id} value={neighborhood.id}>
                    {neighborhood.hamlet.split(" - ")[0]} · RT{" "}
                    {String(neighborhood.rt).padStart(2, "0")}/RW{" "}
                    {String(neighborhood.rw).padStart(2, "0")}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Alamat"
              htmlFor="resident-address"
              required
              error={errors.address?.[0]}
              className="sm:col-span-2"
            >
              <Input
                id="resident-address"
                value={form.address}
                maxLength={400}
                onChange={(event) => set("address", event.target.value)}
                placeholder="Contoh: Kp. Cikembang No. 12"
                aria-invalid={Boolean(errors.address)}
              />
            </Field>
          </div>

          <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-sm border border-line bg-surface-muted px-2.5 py-2">
            <Checkbox
              checked={form.documentsVerified}
              onChange={(event) => set("documentsVerified", event.target.checked)}
              aria-label="Berkas kependudukan sudah diverifikasi"
            />
            <span className="text-2xs leading-4 text-fg-muted">
              <span className="block text-xs font-medium text-fg">
                Berkas sudah diverifikasi
              </span>
              Centang bila KTP dan kartu keluarga asli sudah diperiksa petugas.
            </span>
          </label>

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
              Simpan penduduk
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
