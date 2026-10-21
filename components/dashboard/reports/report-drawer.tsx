"use client";

import * as React from "react";

import {
  CheckCheck,
  CircleAlert,
  Clock3,
  ImagePlus,
  LoaderCircle,
  MapPin,
  MessageSquare,
  Paperclip,
  Phone,
  Printer,
  ShieldCheck,
  Trash2,
  UserCheck,
  Wrench,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/primitives";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { PRIORITY, REPORT_CATEGORY, REPORT_STATUS, ROLE_CAPABILITIES, TONE_CLASSES } from "@/lib/domain";
import { formatBytes, formatDateTime, formatNik, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  errorMessage,
  reportAttachmentFileUrl,
  useAddReportAttachmentsMutation,
  useAdvanceReportMutation,
  useGetShellQuery,
  useListReportAttachmentsQuery,
  useRemoveReportAttachmentMutation,
} from "@/store/api";
import type { ReportRow } from "@/db/queries";
import type { StaffRole } from "@/db/schema";

import { ConfirmDialog } from "../confirm-dialog";
import { useNow } from "../now-context";
import { RejectReportDialog } from "./reject-report-dialog";
import {
  ReportImagePicker,
  appendReportImages,
  type PickedImage,
} from "./report-image-picker";

export function ReportDrawer({
  report,
  onClose,
}: {
  report: ReportRow | null;
  onClose: () => void;
}) {
  const now = useNow();
  const shell = useGetShellQuery();
  const [advance, advanceState] = useAdvanceReportMutation();
  const statusMeta = report ? (REPORT_STATUS[report.status] ?? { label: report.status, tone: "neutral" as const }) : null;

  const canHandle = shell.data?.officer
    ? (ROLE_CAPABILITIES[shell.data.officer.role as StaffRole]?.verify ?? false)
    : false;
  const closed = report?.status === "RESOLVED" || report?.status === "REJECTED";

  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [addPhotosOpen, setAddPhotosOpen] = React.useState(false);
  const [photoDeleteTarget, setPhotoDeleteTarget] = React.useState<{
    id: string;
    fileName: string;
  } | null>(null);
  const [pickedImages, setPickedImages] = React.useState<PickedImage[]>([]);
  const [addPhotos, addPhotosState] = useAddReportAttachmentsMutation();
  const [removePhoto, removePhotoState] = useRemoveReportAttachmentMutation();

  const attachments = useListReportAttachmentsQuery(report?.id ?? "", {
    skip: !report,
  });

  // Another report opens in the same drawer instance — reset the local UI.
  // Adjusting state on a prop change happens during render (no effect) so the
  // sheet never paints the previous report's dialogs first.
  const [lastReportId, setLastReportId] = React.useState<string | null>(report?.id ?? null);
  if ((report?.id ?? null) !== lastReportId) {
    setLastReportId(report?.id ?? null);
    setRejectOpen(false);
    setAddPhotosOpen(false);
    setPhotoDeleteTarget(null);
    setPickedImages([]);
  }

  const submitAddPhotos = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!report || !pickedImages.length) return;
    const form = new FormData();
    appendReportImages(form, pickedImages);
    try {
      await addPhotos({ reportId: report.id, body: form }).unwrap();
      setPickedImages([]);
      setAddPhotosOpen(false);
    } catch {
      // The dialog keeps the server message inline (e.g. TOO_MANY_ATTACHMENTS).
    }
  };

  const confirmRemovePhoto = async () => {
    if (!report || !photoDeleteTarget) return;
    try {
      await removePhoto({
        reportId: report.id,
        attachmentId: photoDeleteTarget.id,
      }).unwrap();
      setPhotoDeleteTarget(null);
    } catch {
      // The dialog keeps the server message inline.
    }
  };

  return (
    <>
      <Sheet open={Boolean(report)} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent
        className="flex w-full flex-col sm:max-w-[min(38rem,94vw)]"
        labelledBy="judul-detail-laporan"
        description="detail-laporan-warga"
        aria-label="Detail laporan warga"
      >
        {report ? (
          <>
            <header className="border-b border-line bg-surface px-4 py-3 pr-12">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs font-semibold tabular-nums tracking-tight text-fg">
                  {report.ticket}
                </span>
                {statusMeta ? (
                  <Badge
                    variant="outline"
                    size="sm"
                    className={cn(TONE_CLASSES[statusMeta.tone].chip)}
                  >
                    {statusMeta.label}
                  </Badge>
                ) : null}
                <Badge variant="neutral" size="sm">
                  {REPORT_CATEGORY[report.category] ?? report.category}
                </Badge>
                {report.priority !== "NORMAL" ? (
                  <Badge
                    variant={report.priority === "DARURAT" ? "rejected" : "pending"}
                    size="sm"
                  >
                    {PRIORITY[report.priority]?.label ?? report.priority}
                  </Badge>
                ) : null}
              </div>

              <SheetTitle
                id="judul-detail-laporan"
                className="mt-1.5 font-display text-sm font-bold leading-5 tracking-[-0.01em] text-fg"
              >
                {report.subject}
              </SheetTitle>
              <SheetDescription id="detail-laporan-warga" className="mt-0.5 text-2xs text-fg-subtle">
                Dilaporkan {formatRelative(report.submittedAt, now)} ·{" "}
                {formatDateTime(report.submittedAt)}
              </SheetDescription>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
             
              <section className="px-4 py-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                  Data Pelapor
                </h3>
                <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <Field label="Nama lengkap" value={report.reporterName} />
                  <Field label="NIK" value={formatNik(report.reporterNik)} mono />
                  <Field
                    label="Nomor telepon"
                    value={report.reporterPhone ?? "—"}
                    icon={Phone}
                    mono
                  />
                  <Field
                    label="Wilayah"
                    value={`${report.dusun ?? "—"}${
                      report.rt !== null
                        ? ` · RT ${String(report.rt).padStart(2, "0")}/RW ${String(
                            report.rw,
                          ).padStart(2, "0")}`
                        : ""
                    }`}
                    icon={MapPin}
                  />
                </dl>
              </section>

              <Separator />


              <section className="px-4 py-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                  Isi Laporan
                </h3>
                <p className="mt-2 whitespace-pre-line text-xs leading-5 text-fg-muted">
                  {report.body}
                </p>
              </section>

              {/* --- photos (W5) ---------------------------------------- */}
              <Separator />

              <section className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                    <Paperclip className="size-3" aria-hidden />
                    Lampiran Foto ({attachments.data?.attachments.length ?? report.attachmentCount})
                  </h3>
                  {canHandle ? (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => setAddPhotosOpen(true)}
                    >
                      <ImagePlus aria-hidden />
                      Tambah foto
                    </Button>
                  ) : null}
                </div>

                {attachments.isLoading ? (
                  <p role="status" className="mt-2 text-2xs text-fg-subtle">
                    Memuat foto…
                  </p>
                ) : (attachments.data?.attachments.length ?? 0) === 0 ? (
                  <p className="mt-2 rounded-sm border border-line bg-surface-muted px-3 py-2 text-[10px] leading-4 text-fg-subtle">
                    Tidak ada foto terlampir. Pelapor maupun petugas dapat
                    menambahkan hingga 4 foto kejadian.
                  </p>
                ) : (
                  <ul className="mt-2 grid grid-cols-3 gap-2">
                    {(attachments.data?.attachments ?? []).map((attachment) => (
                      <li
                        key={attachment.id}
                        className="group relative overflow-hidden rounded-sm border border-line bg-surface-muted"
                      >
                        <a
                          href={reportAttachmentFileUrl(report.id, attachment.id)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Buka foto ${attachment.fileName} di tab baru`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={reportAttachmentFileUrl(report.id, attachment.id)}
                            alt={attachment.caption ?? `Foto laporan ${attachment.fileName}`}
                            className="aspect-square w-full object-cover transition-opacity group-hover:opacity-90"
                          />
                        </a>
                        {canHandle ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPhotoDeleteTarget({
                                id: attachment.id,
                                fileName: attachment.fileName,
                              })
                            }
                            aria-label={`Hapus foto ${attachment.fileName}`}
                            className="absolute right-1 top-1 grid size-5 place-items-center rounded-xs border border-line bg-surface/90 text-fg-subtle opacity-0 transition-opacity hover:border-rejected hover:text-rejected group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            <Trash2 className="size-3" aria-hidden />
                          </button>
                        ) : null}
                        <span className="block truncate px-1.5 py-1 text-[10px] text-fg-subtle">
                          {attachment.caption
                            ? attachment.caption
                            : `${attachment.fileName} · ${formatBytes(attachment.sizeBytes)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <Separator />

 
              <section className="px-4 py-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                  Penanganan
                </h3>
                <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <Field
                    label="Petugas penanggung jawab"
                    value={report.handledByName?.replace(/,.*$/, "") ?? "Belum ditugaskan"}
                    icon={UserCheck}
                    tone={report.handledByName ? "neutral" : "pending"}
                  />
                  <Field
                    label="Tanggapan terkirim"
                    value={`${report.responseCount} tanggapan`}
                    icon={MessageSquare}
                  />
                  <Field
                    label="Lama terbuka"
                    value={
                      report.resolvedAt
                        ? `Selesai ${formatRelative(report.resolvedAt, now)}`
                        : `${report.openDays} hari`
                    }
                    icon={Clock3}
                  />
                  <Field
                    label="Batas tanggapan"
                    value="5 hari kerja (Perdes Pelayanan Publik)"
                    icon={ShieldCheck}
                  />
                </dl>

                {report.status === "REJECTED" && report.rejectionReason ? (
                  <p className="mt-3 flex items-start gap-1.5 rounded-sm border border-rejected-line/60 bg-rejected-bg px-3 py-2 text-[10px] leading-4 text-rejected">
                    <X className="mt-px size-3 shrink-0" aria-hidden />
                    <span>
                      <span className="font-semibold">Alasan penolakan:</span>{" "}
                      {report.rejectionReason}
                    </span>
                  </p>
                ) : null}

                <p className="mt-3 rounded-sm border border-line bg-surface-muted px-3 py-2 text-[10px] leading-4 text-fg-subtle">
                  Setiap perubahan status tercatat pada jejak audit desa dan langsung terlihat oleh
                  pelapor di portal warga.
                </p>

                {canHandle ? (
                  closed ? (
                    <p className="mt-2 rounded-sm border border-line bg-surface-muted px-3 py-2 text-[10px] leading-4 text-fg-subtle">
                      Laporan {report.ticket} sudah ditutup. Pembukaan kembali dilakukan dengan
                      tiket baru.
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={advanceState.isLoading}
                        onClick={() =>
                          advance({
                            id: report.id,
                            body: { status: "IN_PROGRESS", note: "Sedang ditindaklanjuti petugas." },
                          })
                        }
                      >
                        <Wrench aria-hidden />
                        Sedang Dikerjakan
                      </Button>
                      <Button
                        variant="success"
                        size="sm"
                        disabled={advanceState.isLoading}
                        onClick={() =>
                          advance({
                            id: report.id,
                            body: { status: "RESOLVED", note: "Selesai ditindaklanjuti." },
                          })
                        }
                      >
                        {advanceState.isLoading ? <LoaderCircle className="animate-spin" aria-hidden /> : <CheckCheck aria-hidden />}
                        Tandai Selesai
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={advanceState.isLoading}
                        onClick={() => setRejectOpen(true)}
                      >
                        <CircleAlert aria-hidden />
                        Tolak
                      </Button>
                    </div>
                  )
                ) : null}

                {advanceState.isError ? (
                  <p
                    role="alert"
                    className="mt-2 flex items-start gap-1.5 rounded-sm border border-rejected/30 bg-rejected/8 px-3 py-2 text-[10px] leading-4 text-rejected"
                  >
                    <CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                    {errorMessage(advanceState.error)}
                  </p>
                ) : null}
              </section>
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-line bg-surface-muted px-4 py-2.5">
              <p className="text-[10px] text-fg-subtle">
                Tiket {report.ticket} · arsip laporan desa
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (typeof window !== "undefined") window.print();
                  }}
                >
                  <Printer aria-hidden />
                  Cetak Laporan
                </Button>
                <Button variant="primary" size="sm" onClick={onClose}>
                  Tutup
                </Button>
              </div>
            </footer>
          </>
        ) : null}
      </SheetContent>
    </Sheet>

      {report ? (
        <>
          <RejectReportDialog
            reportId={report.id}
            ticket={report.ticket}
            subject={report.subject}
            open={rejectOpen}
            onOpenChange={setRejectOpen}
          />

          <Dialog
            open={addPhotosOpen}
            onOpenChange={addPhotosState.isLoading ? undefined : setAddPhotosOpen}
          >
            <DialogContent
              labelledBy="add-photos-title"
              describedBy="add-photos-desc"
              className="max-w-lg p-5"
            >
              <form onSubmit={submitAddPhotos} noValidate>
                <div className="mb-4 flex items-start gap-2.5 pr-6">
                  <span className="grid size-8 shrink-0 place-items-center rounded-sm border border-civic/25 bg-civic-soft text-civic">
                    <ImagePlus className="size-4" aria-hidden />
                  </span>
                  <div>
                    <h2
                      id="add-photos-title"
                      className="font-display text-sm font-bold tracking-[-0.01em] text-fg"
                    >
                      Tambah Foto ke {report.ticket}
                    </h2>
                    <p
                      id="add-photos-desc"
                      className="mt-0.5 text-2xs leading-4 text-fg-subtle"
                    >
                      Lampirkan dokumentasi tindak lanjut (maks. 4 foto per
                      laporan, {Math.max(0, 4 - report.attachmentCount)} slot
                      tersisa). Foto diperkecil di peramban sebelum diunggah.
                    </p>
                  </div>
                </div>

                <ReportImagePicker
                  idPrefix="drawer-add-photo"
                  images={pickedImages}
                  onImagesChange={setPickedImages}
                  busy={addPhotosState.isLoading}
                />

                {addPhotosState.isError ? (
                  <p
                    role="alert"
                    className="mt-3 flex items-start gap-1.5 rounded-sm border border-rejected-line/60 bg-rejected-bg px-2.5 py-2 text-2xs text-rejected"
                  >
                    <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                    {errorMessage(addPhotosState.error)}
                  </p>
                ) : null}

                <div className="mt-4 flex items-center justify-end gap-1.5 border-t border-line pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAddPhotosOpen(false)}
                    disabled={addPhotosState.isLoading}
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={addPhotosState.isLoading || pickedImages.length === 0}
                  >
                    {addPhotosState.isLoading ? (
                      <LoaderCircle className="animate-spin" aria-hidden />
                    ) : (
                      <ImagePlus aria-hidden />
                    )}
                    Unggah {pickedImages.length || ""} foto
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <ConfirmDialog
            open={photoDeleteTarget !== null}
            onOpenChange={(open) => {
              if (!open) setPhotoDeleteTarget(null);
            }}
            tone="danger"
            icon={Trash2}
            title="Hapus foto laporan?"
            description="Foto dihapus permanen dari penyimpanan desa. Tindakan ini dicatat pada jejak audit."
            details={
              photoDeleteTarget ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="text-fg-subtle">Berkas</dt>
                  <dd className="truncate font-medium text-fg">
                    {photoDeleteTarget.fileName}
                  </dd>
                </dl>
              ) : null
            }
            confirmLabel="Hapus foto"
            loading={removePhotoState.isLoading}
            error={removePhotoState.isError ? errorMessage(removePhotoState.error) : null}
            onConfirm={confirmRemovePhoto}
          />
        </>
      ) : null}
    </>
  );
}

function Field({
  label,
  value,
  icon: Icon,
  mono,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  mono?: boolean;
  tone?: "neutral" | "pending";
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-fg-subtle">
        {Icon ? <Icon className="size-2.5" aria-hidden /> : null}
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-xs",
          mono && "font-mono tabular-nums",
          tone === "pending" ? TONE_CLASSES.pending.text : "text-fg",
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}