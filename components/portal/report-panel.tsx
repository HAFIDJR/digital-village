"use client";

import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  MapPin,
  MessagesSquare,
  RefreshCw,
  Send,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import { PRIORITY, REPORT_CATEGORY, REPORT_STATUS, TONE_CLASSES } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { reportDraftSchema, type ReportDraft } from "@/lib/validators";
import {
  errorFields,
  errorMessage,
  useCreateReportMutation,
  useListResidentReportsQuery,
} from "@/store/api";

export type PortalNeighborhoodOption = { id: string; label: string };

const selectClasses = [
  "h-8 w-full rounded-sm border border-line-strong bg-surface px-2 text-xs text-fg",
  "transition-colors hover:border-slate-400",
  "focus-visible:outline-none focus-visible:border-civic focus-visible:ring-2 focus-visible:ring-civic/22",
  "aria-invalid:border-rejected-solid aria-invalid:ring-2 aria-invalid:ring-rejected-solid/18",
].join(" ");

/**
 * "Buat Laporan / Aspirasi" plus the resident's own "Laporan Saya" register, so
 * the status an officer sets shows up here without a manual reload.
 */
export function ReportPanel({
  neighborhoods,
  defaultNeighborhoodId,
}: {
  neighborhoods: PortalNeighborhoodOption[];
  defaultNeighborhoodId: string;
}) {
  const reports = useListResidentReportsQuery();
  const [createReport, createState] = useCreateReportMutation();

  const [category, setCategory] = React.useState<ReportDraft["category"]>("INFRASTRUKTUR");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [neighborhoodId, setNeighborhoodId] = React.useState(defaultNeighborhoodId);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [submitted, setSubmitted] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    setSubmitted(null);

    const parsed = reportDraftSchema.safeParse({
      category,
      subject,
      body,
      neighborhoodId: neighborhoodId || undefined,
      priority: "NORMAL",
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
      const result = await createReport(parsed.data).unwrap();
      setSubmitted(result.report.ticket);
      setSubject("");
      setBody("");
    } catch (error) {
      setErrors(errorFields(error));
    }
  };

  const rows = reports.data?.reports ?? [];
  const open = rows.filter((row) => ["NEW", "IN_PROGRESS"].includes(row.status)).length;
  const canSubmit = subject.trim().length >= 8 && body.trim().length >= 20;

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------ composer */}
      <section
        aria-labelledby="buat-laporan"
        className="rounded-lg border border-line bg-surface"
      >
        <div className="border-b border-line px-4 py-2.5">
          <h2 id="buat-laporan" className="text-xs font-semibold text-fg">
            Buat Laporan / Aspirasi
          </h2>
          <p className="mt-0.5 text-2xs leading-4 text-fg-subtle">
            Sampaikan keluhan, usulan, atau aspirasi Anda. Laporan diteruskan ke
            perangkat desa dan ditindaklanjuti sesuai kategori.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3 px-4 py-3" noValidate>
          {submitted ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-sm border border-approved-line/70 bg-approved-bg px-2.5 py-2 text-2xs text-approved"
            >
              <CircleCheck className="mt-px size-3.5 shrink-0" aria-hidden />
              Laporan terkirim dengan nomor{" "}
              <span className="tnum font-mono font-semibold">{submitted}</span>.
              Pantau tindak lanjutnya pada daftar “Laporan Saya”.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Kategori"
              htmlFor="report-category"
              required
              error={errors.category?.[0]}
            >
              <select
                id="report-category"
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as ReportDraft["category"])
                }
                className={selectClasses}
              >
                {Object.entries(REPORT_CATEGORY).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Lokasi kejadian"
              htmlFor="report-neighborhood"
              error={errors.neighborhoodId?.[0]}
              hint="Secara bawaan mengikuti alamat terdaftar Anda."
            >
              <select
                id="report-neighborhood"
                value={neighborhoodId}
                onChange={(event) => setNeighborhoodId(event.target.value)}
                className={selectClasses}
              >
                {neighborhoods.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            label="Judul laporan"
            htmlFor="report-subject"
            required
            error={errors.subject?.[0]}
            counter={`${subject.length}/200`}
          >
            <Input
              id="report-subject"
              value={subject}
              maxLength={200}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Contoh: Saluran air tersumbat di Kp. Cikembang"
              aria-invalid={Boolean(errors.subject)}
            />
          </Field>

          <Field
            label="Uraian kejadian"
            htmlFor="report-body"
            required
            error={errors.body?.[0]}
            hint="Sebutkan waktu, lokasi, dan dampak yang Anda rasakan."
            counter={`${body.length} karakter`}
          >
            <Textarea
              id="report-body"
              value={body}
              rows={5}
              maxLength={2000}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Jelaskan apa yang terjadi agar petugas dapat menindaklanjuti…"
              aria-invalid={Boolean(errors.body)}
            />
          </Field>

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

          <div className="flex items-center justify-end gap-1.5 border-t border-line pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSubject("");
                setBody("");
                setErrors({});
                setSubmitted(null);
              }}
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
                canSubmit
                  ? undefined
                  : "Lengkapi judul (min. 8 karakter) dan uraian (min. 20 karakter)"
              }
            >
              {createState.isLoading ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <Send aria-hidden />
              )}
              Kirim laporan
            </Button>
          </div>
        </form>
      </section>

      {/* -------------------------------------------------- my reports */}
      <section
        aria-labelledby="laporan-saya"
        className="rounded-lg border border-line bg-surface"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div>
            <h2 id="laporan-saya" className="text-xs font-semibold text-fg">
              Laporan Saya
            </h2>
            <p className="mt-0.5 text-2xs text-fg-subtle">
              {rows.length} total · {open} masih ditindaklanjuti
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => reports.refetch()}
            disabled={reports.isFetching}
            aria-label="Segarkan daftar laporan"
          >
            <RefreshCw className={cn(reports.isFetching && "animate-spin")} aria-hidden />
            Segarkan
          </Button>
        </div>

        {reports.isError ? (
          <p role="alert" className="px-4 py-4 text-2xs text-rejected">
            {errorMessage(reports.error)}
          </p>
        ) : null}

        {reports.isLoading ? (
          <ul className="divide-y divide-line" aria-busy="true">
            {Array.from({ length: 2 }).map((_, index) => (
              <li key={index} className="px-4 py-3">
                <div className="h-3 w-44 rounded-sm bg-surface-muted" />
                <div className="mt-2 h-2.5 w-64 rounded-sm bg-surface-muted" />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span className="grid size-9 place-items-center rounded-md border border-line bg-surface-muted">
              <MessagesSquare className="size-4 text-fg-subtle" aria-hidden />
            </span>
            <p className="text-xs font-medium text-fg">Belum ada laporan</p>
            <p className="max-w-sm text-2xs leading-4 text-fg-subtle">
              Gunakan formulir di atas untuk menyampaikan keluhan atau aspirasi
              Anda kepada perangkat desa.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((report) => {
              const status = REPORT_STATUS[report.status] ?? {
                label: report.status,
                tone: "neutral" as const,
              };
              const priority = PRIORITY[report.priority];
              return (
                <li key={report.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-fg">{report.subject}</p>
                      <p className="tnum mt-0.5 font-mono text-2xs text-fg-subtle">
                        {report.ticket} · {REPORT_CATEGORY[report.category] ?? report.category} ·
                        diajukan {formatDate(report.submittedAt)}
                      </p>
                      <p className="mt-1 line-clamp-2 max-w-md text-2xs leading-4 text-fg-muted">
                        {report.body}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-fg-subtle">
                        {report.dusun ? (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-2.5" aria-hidden />
                            {report.dusun}
                            {report.rt !== null && report.rw !== null
                              ? ` · RT ${String(report.rt).padStart(2, "0")}/RW ${String(report.rw).padStart(2, "0")}`
                              : ""}
                          </span>
                        ) : null}
                        {report.handledByName ? (
                          <>
                            <span aria-hidden>·</span>
                            <span>Ditangani {report.handledByName}</span>
                          </>
                        ) : null}
                        {report.resolvedAt ? (
                          <>
                            <span aria-hidden>·</span>
                            <span className="tnum">
                              selesai {formatDate(report.resolvedAt)}
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge
                        variant="outline"
                        size="sm"
                        className={cn(TONE_CLASSES[status.tone].chip)}
                      >
                        {status.label}
                      </Badge>
                      {priority && priority.label !== "Normal" ? (
                        <span
                          className={cn("text-[10px] font-medium", priority.className)}
                        >
                          {priority.label}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
