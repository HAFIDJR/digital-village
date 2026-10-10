"use client";

import {
  CircleAlert,
  CircleCheck,
  FileUp,
  LoaderCircle,
  Paperclip,
  Send,
  Trash2,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import { REQUEST_CHANNEL } from "@/lib/domain";
import { formatBytes, formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { letterRequestDraftSchema } from "@/lib/validators";
import type { ResidentLetterType } from "@/db/queries";
import {
  errorFields,
  errorMessage,
  useCreateRequestMutation,
  useListResidentLetterTypesQuery,
} from "@/store/api";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * "Ajukan Surat" — pilih jenis surat, jelaskan keperluan, unggah berkas
 * persyaratan. Identity comes from the signed-in resident, never from the form.
 */
export function RequestComposer() {
  const letterTypes = useListResidentLetterTypesQuery();
  const [createRequest, createState] = useCreateRequestMutation();

  const [letterTypeId, setLetterTypeId] = React.useState("");
  const [purpose, setPurpose] = React.useState("");
  const [keterangan, setKeterangan] = React.useState("");
  const [files, setFiles] = React.useState<Record<string, File>>({});
  const [fileErrors, setFileErrors] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [submitted, setSubmitted] = React.useState<{
    ticket: string;
    letterName: string;
  } | null>(null);

  const selected: ResidentLetterType | undefined = letterTypes.data?.letterTypes.find(
    (type) => type.id === letterTypeId,
  );

  const reset = () => {
    setLetterTypeId("");
    setPurpose("");
    setKeterangan("");
    setFiles({});
    setFileErrors({});
    setErrors({});
    setSubmitted(null);
  };

  const pickFile = (docKey: string, file: File | null) => {
    setFileErrors((current) => {
      const next = { ...current };
      delete next[docKey];
      return next;
    });

    if (!file) {
      setFiles((current) => {
        const next = { ...current };
        delete next[docKey];
        return next;
      });
      return;
    }

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFileErrors((current) => ({
        ...current,
        [docKey]: "Format berkas harus JPG, PNG, atau PDF.",
      }));
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileErrors((current) => ({
        ...current,
        [docKey]: "Ukuran berkas maksimal 5 MB.",
      }));
      return;
    }
    if (file.size === 0) {
      setFileErrors((current) => ({
        ...current,
        [docKey]: "Berkas kosong. Pilih ulang hasil pindai Anda.",
      }));
      return;
    }

    setFiles((current) => ({ ...current, [docKey]: file }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    setSubmitted(null);

    const payload: Record<string, string> = {};
    if (keterangan.trim()) payload.keterangan = keterangan.trim();

    // Client-side parse first so the resident sees the problem without a round trip.
    const parsed = letterRequestDraftSchema.safeParse({
      letterTypeId,
      purpose,
      channel: "WEBSITE",
      payload,
      attachments: Object.entries(files).map(([docKey, file]) => ({
        docKey,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      })),
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

    const form = new FormData();
    form.set("letterTypeId", letterTypeId);
    form.set("purpose", purpose);
    form.set("channel", "WEBSITE");
    form.set("payload", JSON.stringify(payload));
    for (const [docKey, file] of Object.entries(files)) {
      form.append(`file:${docKey}`, file);
    }

    try {
      const result = await createRequest(form).unwrap();
      setSubmitted({
        ticket: result.request.ticket,
        letterName: selected?.name ?? "Surat",
      });
      setLetterTypeId("");
      setPurpose("");
      setKeterangan("");
      setFiles({});
    } catch (error) {
      setErrors(errorFields(error));
    }
  };

  const missingMandatory = (selected?.requirements ?? [])
    .filter((req) => req.mandatory && !files[req.docKey])
    .map((req) => req.label);
  const canSubmit =
    Boolean(letterTypeId) &&
    purpose.trim().length >= 10 &&
    missingMandatory.length === 0 &&
    Object.keys(fileErrors).length === 0;

  if (letterTypes.isLoading) {
    return (
      <p className="px-4 py-6 text-center text-2xs text-fg-subtle">
        Memuat daftar layanan surat…
      </p>
    );
  }

  if (letterTypes.isError) {
    return (
      <p role="alert" className="px-4 py-6 text-center text-2xs text-rejected">
        {errorMessage(letterTypes.error)}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 px-4 py-3" noValidate>
      {submitted ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-sm border border-approved-line/70 bg-approved-bg px-2.5 py-2 text-2xs text-approved"
        >
          <CircleCheck className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            Pengajuan {submitted.letterName} terkirim dengan nomor berkas{" "}
            <span className="tnum font-mono font-semibold">{submitted.ticket}</span>.
            Pantau statusnya pada daftar di bawah.
          </span>
        </p>
      ) : null}

      <Field
        label="Jenis surat"
        htmlFor="request-letter-type"
        required
        error={errors.letterTypeId?.[0]}
        hint="Pilih layanan yang Anda butuhkan. Biaya dan batas waktu tertera pada tiap layanan."
      >
        <select
          id="request-letter-type"
          value={letterTypeId}
          onChange={(event) => {
            setLetterTypeId(event.target.value);
            setFiles({});
            setFileErrors({});
          }}
          aria-invalid={Boolean(errors.letterTypeId)}
          className={cn(
            "h-8 w-full rounded-sm border border-line-strong bg-surface px-2 text-xs text-fg",
            "focus-visible:outline-none focus-visible:border-civic focus-visible:ring-2 focus-visible:ring-civic/22",
          )}
        >
          <option value="">— Pilih jenis surat —</option>
          {(letterTypes.data?.letterTypes ?? []).map((type) => (
            <option key={type.id} value={type.id}>
              {type.name} ({type.code})
            </option>
          ))}
        </select>
      </Field>

      {selected ? (
        <div className="rounded-sm border border-line bg-surface-muted px-2.5 py-2 text-2xs leading-4 text-fg-muted">
          <p>{selected.description ?? selected.templateTitle}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-fg-subtle">
            <span className="tnum">
              Selesai maksimal {selected.slaDays} hari kerja
            </span>
            <span aria-hidden>·</span>
            <span className="tnum">
              Biaya {selected.feeIdr > 0 ? formatCurrency(selected.feeIdr) : "gratis"}
            </span>
            <span aria-hidden>·</span>
            <span>{REQUEST_CHANNEL.WEBSITE}</span>
          </p>
        </div>
      ) : null}

      <Field
        label="Keperluan surat"
        htmlFor="request-purpose"
        required
        error={errors.purpose?.[0]}
        hint="Tuliskan untuk apa surat ini digunakan, misalnya nama instansi tujuan."
        counter={`${purpose.length}/500`}
      >
        <Textarea
          id="request-purpose"
          value={purpose}
          rows={3}
          maxLength={500}
          onChange={(event) => setPurpose(event.target.value)}
          placeholder="Contoh: Persyaratan pengajuan Kredit Usaha Rakyat (KUR) di BRI Unit Cimaung"
          aria-invalid={Boolean(errors.purpose)}
        />
      </Field>

      <Field
        label="Keterangan tambahan"
        htmlFor="request-keterangan"
        hint="Opsional — dicantumkan pada isi surat bila diperlukan."
      >
        <Input
          id="request-keterangan"
          value={keterangan}
          maxLength={160}
          onChange={(event) => setKeterangan(event.target.value)}
          placeholder="Contoh: Nama usaha Warung Sembako Bu Imas"
        />
      </Field>

      {selected ? (
        <fieldset className="space-y-2 rounded-sm border border-line bg-surface-muted p-2.5">
          <legend className="px-1 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
            Berkas persyaratan
          </legend>
          {selected.requirements.length === 0 ? (
            <p className="text-2xs text-fg-subtle">
              Layanan ini tidak membutuhkan berkas pindai.
            </p>
          ) : (
            <ul className="space-y-2">
              {selected.requirements.map((requirement) => {
                const file = files[requirement.docKey];
                return (
                  <li key={requirement.docKey}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-2xs font-medium text-fg">
                        {requirement.label}
                        {requirement.mandatory ? (
                          <span className="ml-0.5 text-rejected-solid" aria-hidden>
                            *
                          </span>
                        ) : (
                          <span className="ml-1 text-[10px] font-normal text-fg-subtle">
                            (opsional)
                          </span>
                        )}
                      </span>
                      {file ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => pickFile(requirement.docKey, null)}
                          aria-label={`Hapus berkas ${requirement.label}`}
                        >
                          <Trash2 aria-hidden />
                          Hapus
                        </Button>
                      ) : null}
                    </div>

                    {file ? (
                      <p className="mt-1 flex items-center gap-1.5 text-[10px] text-fg-subtle">
                        <Paperclip className="size-3" aria-hidden />
                        <span className="truncate">{file.name}</span>
                        <span className="tnum">· {formatBytes(file.size)}</span>
                      </p>
                    ) : (
                      <label className="mt-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-dashed border-line-strong bg-surface px-2.5 py-2 text-2xs text-fg-muted transition-colors hover:border-civic hover:text-civic">
                        <FileUp className="size-3.5" aria-hidden />
                        Pilih berkas (JPG, PNG, atau PDF · maks. 5 MB)
                        <input
                          type="file"
                          className="sr-only"
                          accept={ACCEPTED_TYPES.join(",")}
                          onChange={(event) =>
                            pickFile(
                              requirement.docKey,
                              event.target.files?.[0] ?? null,
                            )
                          }
                          aria-label={`Unggah ${requirement.label}`}
                        />
                      </label>
                    )}

                    {fileErrors[requirement.docKey] ? (
                      <p role="alert" className="mt-1 text-[10px] text-rejected">
                        {fileErrors[requirement.docKey]}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      ) : null}

      {errors._form?.length ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-sm border border-rejected-line/60 bg-rejected-bg px-2.5 py-2 text-2xs text-rejected"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {errors._form[0]}
        </p>
      ) : null}

      {createState.isError ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-sm border border-rejected-line/60 bg-rejected-bg px-2.5 py-2 text-2xs text-rejected"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {errorMessage(createState.error)}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="min-w-0 text-[10px] leading-4 text-fg-subtle">
          {selected ? (
            missingMandatory.length ? (
              <span>
                Berkas wajib belum diunggah: {missingMandatory.join(", ")}
              </span>
            ) : (
              <Badge variant="approved" size="sm">
                Berkas wajib lengkap
              </Badge>
            )
          ) : (
            <span>Pilih jenis surat untuk melihat persyaratannya.</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={createState.isLoading}
          >
            Kosongkan
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!canSubmit || createState.isLoading}
            title={
              canSubmit ? undefined : "Lengkapi jenis surat, keperluan, dan berkas wajib"
            }
          >
            {createState.isLoading ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <Send aria-hidden />
            )}
            Kirim pengajuan
          </Button>
        </div>
      </div>
    </form>
  );
}
