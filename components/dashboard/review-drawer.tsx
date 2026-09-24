"use client";

import {
  BadgeCheck,
  Check,
  CircleAlert,
  Clock3,
  FileText,
  IdCard,
  LoaderCircle,
  MapPin,
  Paperclip,
  PenLine,
  Printer,
  QrCode,
  RotateCw,
  ShieldCheck,
  Stamp,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator, Skeleton, Textarea } from "@/components/ui/primitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ACTIVITY_KIND, REQUEST_CHANNEL, TONE_CLASSES } from "@/lib/domain";
import {
  ageFrom,
  formatBytes,
  formatDate,
  formatDateTime,
  formatKk,
  formatNik,
  formatNumber,
  formatRelative,
} from "@/lib/format";
import { ESIGN_TRAINING_PASSPHRASE } from "@/lib/esign";
import { useNow } from "./now-context";
import { cn } from "@/lib/utils";
import type { AttachmentView, RequestDetail } from "@/db/queries";
import type { LetterAttachmentStatus } from "@/db/schema";
import {
  errorMessage,
  letterPdfUrl,
  useGetRequestQuery,
  useSignRequestMutation,
  useVerifyRequestMutation,
} from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store";
import { queueActions } from "@/store/queue-slice";
import { uiActions } from "@/store/ui-slice";
import { AttachmentStatusBadge, DocumentBadge, PriorityMarker, RequestStatusBadge } from "./status-badge";
import { QueryErrorState, toastFromMutation } from "./feedback";

/**
 * Slide-over dossier.
 *
 * Why a sheet rather than a page: the officer is working a queue. Navigating
 * away loses scroll position, filter state and the row they were on. A drawer
 * keeps the worklist visible behind it, so reviewing thirty files in a row is
 * thirty Escapes, not thirty navigations.
 */
export function ReviewDrawer() {
  const dispatch = useAppDispatch();
  const requestId = useAppSelector((state) => state.queue.selectedRequestId);
  const open = Boolean(requestId);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) dispatch(queueActions.requestSelected(null));
      }}
    >
      <SheetContent
        side="right"
        labelledBy="drawer-title"
        description="detail-pengajuan"
        aria-label="Tinjau berkas pengajuan warga"
      >
        {requestId ? <DrawerBody requestId={requestId} /> : null}
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */

function DrawerBody({ requestId }: { requestId: string }) {
  const { data, isLoading, isError, error, refetch } = useGetRequestQuery(requestId);

  if (isLoading) return <DrawerSkeleton />;

  if (isError || !data) {
    return (
      <>
        <header className="border-b border-line bg-surface px-4 pb-3 pt-3.5">
          <SheetTitle id="drawer-title">Tinjau Berkas</SheetTitle>
          <p className="mt-0.5 text-2xs text-fg-subtle">Detail pengajuan tidak dapat dimuat</p>
        </header>
        <QueryErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      </>
    );
  }

  return <DrawerContent detail={data} />;
}

function DrawerContent({ detail }: { detail: RequestDetail }) {
  const dispatch = useAppDispatch();
  const now = useNow();
  const [verify, verifyState] = useVerifyRequestMutation();
  const [sign, signState] = useSignRequestMutation();

  const [rejectNote, setRejectNote] = React.useState("");
  const [showReject, setShowReject] = React.useState(false);
  const [passphrase, setPassphrase] = React.useState("");
  const [showSign, setShowSign] = React.useState(false);
  const [zoom, setZoom] = React.useState(1);
  const [activeAttachment, setActiveAttachment] = React.useState<string | null>(
    detail.attachments[0]?.id ?? null,
  );
  const [verdicts, setVerdicts] = React.useState<Record<string, LetterAttachmentStatus>>(() =>
    Object.fromEntries(detail.attachments.map((a) => [a.id, a.status as LetterAttachmentStatus])),
  );

  const current = detail.attachments.find((a) => a.id === activeAttachment) ?? detail.attachments[0];
  const defectCount = Object.values(verdicts).filter((v) => v !== "LENGKAP").length;
  const canApprove = detail.status === "PENDING_VERIFIKASI" || detail.status === "BERKAS_TIDAK_LENGKAP" || detail.status === "DIVERIFIKASI";
  const forwardingToKades = detail.status === "DIVERIFIKASI";
  const canSign = detail.status === "MENUNGGU_TTD_KADES";
  const canPrintFinal = Boolean(detail.signature?.signedAt) || detail.status === "SIAP_DIAMBIL" || detail.status === "SELESAI";

  const attachmentPayload = () =>
    Object.entries(verdicts).map(([attachmentId, status]) => ({
      attachmentId,
      status,
      defectNote:
        status === "LENGKAP"
          ? undefined
          : (detail.attachments.find((a) => a.id === attachmentId)?.defectNote ??
            "Perlu diunggah ulang dengan kualitas lebih baik"),
    }));

  const approve = async () => {
    try {
      const result = await verify({
        id: detail.id,
        body: { action: "setujui", attachments: attachmentPayload(), expedite: false },
      }).unwrap();
      toastFromMutation(dispatch, {
        tone: "success",
        title:
          result.status === "MENUNGGU_TTD_KADES"
            ? `${result.ticket} diteruskan ke tanda tangan`
            : `${result.ticket} dinyatakan lengkap`,
        body:
          result.status === "MENUNGGU_TTD_KADES"
            ? "Berkas tercatat pada agenda tanda tangan elektronik Kepala Desa."
            : "Seluruh berkas lolos verifikasi. Teruskan pengajuan untuk memperoleh tanda tangan Kepala Desa.",
      });
      dispatch(queueActions.requestSelected(null));
    } catch (mutationError) {
      toastFromMutation(dispatch, {
        tone: "danger",
        title: "Berkas tidak dapat disetujui",
        body: errorMessage(mutationError),
      });
    }
  };

  const requestRepair = async () => {
    try {
      await verify({
        id: detail.id,
        body: {
          action: "minta_perbaikan",
          note: rejectNote || "Berkas belum memenuhi syarat, mohon dilengkapi dan diajukan kembali.",
          attachments: attachmentPayload(),
          expedite: false,
        },
      }).unwrap();
      toastFromMutation(dispatch, {
        tone: "warning",
        title: `${detail.ticket} dikembalikan untuk perbaikan`,
        body: "Notifikasi telah dikirim ke nomor pemohon.",
      });
      dispatch(queueActions.requestSelected(null));
    } catch (mutationError) {
      toastFromMutation(dispatch, {
        tone: "danger",
        title: "Gagal mengembalikan berkas",
        body: errorMessage(mutationError),
      });
    }
  };

  const applySignature = async () => {
    try {
      const result = await sign({ id: detail.id, passphrase }).unwrap();
      toastFromMutation(dispatch, {
        tone: "success",
        title: `${result.ticket} ditandatangani digital`,
        body: `Sertifikat ${result.certificateSerial} · ${result.signerName}. Surat siap dicetak.`,
      });
      setShowSign(false);
      setPassphrase("");
    } catch (mutationError) {
      toastFromMutation(dispatch, {
        tone: "danger",
        title: "Tanda tangan gagal",
        body: errorMessage(mutationError),
      });
    }
  };

  const applicantAge = detail.applicant.birthDate ? ageFrom(detail.applicant.birthDate, now) : null;

  return (
    <>
      {/* ============================================================ header */}
      <header className="shrink-0 border-b border-line bg-surface px-4 pb-3 pt-3.5 pr-12">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold tabular-nums tracking-tight text-fg">
            {detail.ticket}
          </span>
          <RequestStatusBadge status={detail.status} />
          <PriorityMarker priority={detail.priority} />
          <Badge variant="neutral" size="sm" mono>
            {detail.letter.code}
          </Badge>
        </div>

        <SheetTitle id="drawer-title" className="mt-1.5 block">
          {detail.letter.name}
        </SheetTitle>
        <SheetDescription id="detail-pengajuan" className="mt-0.5 block">
          Diajukan {formatDateTime(detail.submittedAt)} melalui{" "}
          {REQUEST_CHANNEL[detail.channel] ?? detail.channel} · agenda #{detail.agendaNumber ?? "—"}
        </SheetDescription>

        <dl className="mt-2.5 grid grid-cols-3 gap-2">
          <MetaStat
            label="Batas SLA"
            value={formatDate(detail.dueAt)}
            tone="neutral"
            hint={`${detail.letter.slaDays} hari kerja sejak pengajuan`}
          />
          <MetaStat
            label="Kelengkapan"
            value={`${detail.documentsUploaded}/${detail.documentsRequired}`}
            tone={defectCount > 0 ? "pending" : "approved"}
            hint="Jumlah berkas terunggah dari yang diwajibkan"
          />
          <MetaStat
            label="Retribusi"
            value={detail.letter.feeIdr > 0 ? `Rp ${formatNumber(detail.letter.feeIdr)}` : "Gratis"}
            tone="neutral"
            hint="Biaya administrasi sesuai Perdes tentang Pungutan Desa"
          />
        </dl>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* ==================================================== applicant card */}
        <Section
          title="Data Pemohon"
          icon={IdCard}
          action={
            <Badge variant="civic" size="sm">
              {detail.applicant.status === "AKTIF" ? "Warga Terdaftar" : detail.applicant.status}
            </Badge>
          }
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <Field label="Nama Lengkap" value={detail.applicant.fullName} strong />
            <Field
              label="NIK"
              value={formatNik(detail.applicant.nik)}
              mono
              hint={`16 digit · ${detail.applicant.nik}`}
            />
            <Field
              label="Tempat / Tanggal Lahir"
              value={[detail.applicant.birthPlace, formatDate(detail.applicant.birthDate)]
                .filter(Boolean)
                .join(", ")}
              hint={applicantAge !== null ? `${applicantAge} tahun` : undefined}
            />
            <Field
              label="Jenis Kelamin"
              value={detail.applicant.gender === "L" ? "Laki-laki" : detail.applicant.gender === "P" ? "Perempuan" : "—"}
            />
            <Field label="Pekerjaan" value={detail.applicant.occupation ?? "—"} />
            <Field label="Pendidikan" value={detail.applicant.education ?? "—"} />
            <Field
              label="Status Perkawinan"
              value={
                {
                  BELUM_MENIKAH: "Belum Menikah",
                  KAWIN: "Kawin",
                  CERAI_HIDUP: "Cerai Hidup",
                  CERAI_MATI: "Cerai Mati",
                }[detail.applicant.maritalStatus ?? ""] ?? "—"
              }
            />
            <Field
              label="Agama / Kewarganegaraan"
              value={`${detail.applicant.religion ?? "—"} · ${detail.applicant.nationality ?? "WNI"}`}
            />
          </div>

          <Separator className="my-3" />

          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <Field
              label="Nomor Kartu Keluarga"
              value={detail.family.kkNumber ? formatKk(detail.family.kkNumber) : "—"}
              mono
            />
            <Field
              label="Kepala Keluarga"
              value={detail.family.headName ?? "—"}
              hint={detail.family.memberCount ? `${detail.family.memberCount} anggota keluarga` : undefined}
            />
            <Field
              label="Kedudukan dalam Keluarga"
              value={detail.applicant.familyRelation?.replace(/_/g, " ") ?? "—"}
            />
            <Field label="Nomor Telepon" value={detail.applicant.phone ?? "Tidak terdaftar"} mono />
          </div>

          <Separator className="my-3" />

          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden />
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
                Alamat Domisili
              </p>
              <p className="mt-0.5 text-xs leading-5 text-fg">{detail.applicant.address}</p>
              <p className="tnum mt-0.5 text-2xs text-fg-subtle">
                {detail.location.dusun} · RT {String(detail.location.rt).padStart(2, "0")}/RW{" "}
                {String(detail.location.rw).padStart(2, "0")}
                {detail.location.headName ? ` · Ketua RT: ${detail.location.headName}` : ""}
              </p>
            </div>
          </div>
        </Section>

        {/* ======================================================= attachment viewer */}
        <Section
          title={`Berkas Persyaratan (${detail.attachments.length})`}
          icon={Paperclip}
          action={
            defectCount > 0 ? (
              <Badge variant="pending" size="sm">
                {defectCount} perlu diperbaiki
              </Badge>
            ) : (
              <Badge variant="approved" size="sm">
                Semua terbaca
              </Badge>
            )
          }
        >
          {detail.attachments.length === 0 ? (
            <p className="rounded-sm border border-dashed border-line-strong bg-surface-muted px-3 py-4 text-center text-2xs text-fg-subtle">
              Pemohon belum mengunggah berkas apa pun.
            </p>
          ) : (
            <div className="flex flex-col gap-3 lg:flex-row">
              {/* --- thumbnail rail ------------------------------------- */}
              <ul className="flex shrink-0 gap-2 overflow-x-auto lg:w-[104px] lg:flex-col lg:overflow-visible">
                {detail.attachments.map((attachment) => (
                  <li key={attachment.id} className="shrink-0">
                    <AttachmentThumb
                      attachment={attachment}
                      active={attachment.id === current?.id}
                      verdict={verdicts[attachment.id]}
                      onSelect={() => {
                        setActiveAttachment(attachment.id);
                        setZoom(1);
                      }}
                    />
                  </li>
                ))}
              </ul>

              {/* --- scan preview --------------------------------------- */}
              {current ? (
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-fg">{current.label}</p>
                      <p className="truncate font-mono text-2xs text-fg-subtle" title={current.fileName}>
                        {current.fileName} · {formatBytes(current.sizeBytes)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))}
                        disabled={zoom <= 1}
                        aria-label="Perkecil pratinjau"
                      >
                        <ZoomOut aria-hidden />
                      </Button>
                      <span className="tnum w-9 text-center text-2xs text-fg-subtle">
                        {Math.round(zoom * 100)}%
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                        disabled={zoom >= 3}
                        aria-label="Perbesar pratinjau"
                      >
                        <ZoomIn aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setZoom(1)}
                        aria-label="Atur ulang perbesaran"
                      >
                        <RotateCw aria-hidden />
                      </Button>
                    </div>
                  </div>

                  <ScanPlaceholder attachment={current} zoom={zoom} />

                  {/* --- per-document verdict --------------------------- */}
                  <div className="rounded-sm border border-line bg-surface-muted p-2.5">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
                      Penilaian petugas atas berkas ini
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(
                        [
                          ["LENGKAP", "Terbaca & Sesuai"],
                          ["BURAM", "Buram / Tidak Jelas"],
                          ["TIDAK_RELEVAN", "Tidak Relevan"],
                          ["TIDAK_ADA", "Tidak Ada"],
                        ] as [LetterAttachmentStatus, string][]
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={verdicts[current.id] === value}
                          onClick={() => setVerdicts((prev) => ({ ...prev, [current.id]: value }))}
                          className={cn(
                            "h-[26px] rounded-sm border px-2 text-2xs font-medium transition-colors",
                            verdicts[current.id] === value
                              ? value === "LENGKAP"
                                ? TONE_CLASSES.approved.chip
                                : value === "BURAM"
                                  ? TONE_CLASSES.pending.chip
                                  : TONE_CLASSES.rejected.chip
                              : "border-line-strong bg-surface text-fg-muted hover:border-slate-400 hover:bg-surface",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic/45",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {verdicts[current.id] && verdicts[current.id] !== "LENGKAP" ? (
                      <p className="mt-2 rounded-xs border border-pending-line/60 bg-pending-bg px-2 py-1.5 text-2xs text-pending">
                        Berkas ini akan dicatat bermasalah. Bila pengajuan disetujui, sistem menolak
                        sampai statusnya diperbaiki.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {detail.missingRequirements.length > 0 ? (
            <div className="mt-3 rounded-sm border border-rejected-line/50 bg-rejected-bg/70 p-2.5">
              <p className="flex items-center gap-1.5 text-2xs font-semibold text-rejected">
                <CircleAlert className="size-3.5" aria-hidden />
                Belum diunggah oleh pemohon
              </p>
              <ul className="mt-1.5 space-y-1">
                {detail.missingRequirements.map((req) => (
                  <li key={req.docKey} className="flex items-center gap-1.5 text-2xs text-rejected/90">
                    <span aria-hidden className="size-1 rounded-full bg-rejected-solid" />
                    {req.label}
                    {req.mandatory ? (
                      <span className="font-semibold">(wajib)</span>
                    ) : (
                      <span className="text-rejected/70">(opsional)</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>

        {/* ========================================================== purpose */}
        <Section title="Maksud & Keperluan" icon={FileText}>
          <p className="text-xs leading-5 text-fg-muted">{detail.purpose}</p>
          {Object.keys(detail.payload ?? {}).length > 0 ? (
            <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
              {Object.entries(detail.payload)
                .filter(([, value]) => value !== null && value !== "")
                .map(([key, value]) => (
                  <Field
                    key={key}
                    label={PAYLOAD_LABELS[key] ?? key}
                    value={String(value)}
                  />
                ))}
            </dl>
          ) : null}

          {detail.complianceNote ? (
            <p className="mt-2.5 flex items-start gap-1.5 rounded-sm border border-pending-line/60 bg-pending-bg px-2.5 py-2 text-2xs leading-4 text-pending">
              <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">Catatan verifikasi: </span>
                {detail.complianceNote}
              </span>
            </p>
          ) : null}

          {detail.rejectionReason ? (
            <p className="mt-2.5 flex items-start gap-1.5 rounded-sm border border-rejected-line/60 bg-rejected-bg px-2.5 py-2 text-2xs leading-4 text-rejected">
              <X className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">Alasan penolakan: </span>
                {detail.rejectionReason}
              </span>
            </p>
          ) : null}
        </Section>

        {/* ======================================================== e-sign */}
        {detail.letter.requiresKadesSignature ? (
          <Section
            title="Alur Tanda Tangan Elektronik"
            icon={PenLine}
            action={
              detail.signature ? (
                <Badge
                  variant={detail.signature.status === "DITANDATANGANI" ? "approved" : "pending"}
                  size="sm"
                >
                  {detail.signature.status === "DITANDATANGANI"
                    ? "Sudah ditandatangani"
                    : detail.signature.status === "MENUNGGU"
                      ? "Menunggu tanda tangan"
                      : detail.signature.status}
                </Badge>
              ) : (
                <Badge variant="neutral" size="sm">
                  Belum diajukan
                </Badge>
              )
            }
          >
            {detail.signature ? (
              <div className="space-y-2">
                <ol className="space-y-2">
                  <SignatureStep
                    title="Diverifikasi Sekretaris Desa"
                    meta={
                      detail.signature.requestedByName
                        ? `oleh ${detail.signature.requestedByName}`
                        : "—"
                    }
                    time={detail.signature.requestedAt}
                    done
                  />
                  <SignatureStep
                    title="Ditandatangani Kepala Desa"
                    meta={
                      detail.signature.status === "DITANDATANGANI"
                        ? `oleh ${detail.signature.signerName ?? detail.letter.name} · sertifikat BSrE`
                        : "menunggu tindakan"
                    }
                    time={detail.signature.signedAt}
                    done={detail.signature.status === "DITANDATANGANI"}
                    pending={detail.signature.status === "MENUNGGU"}
                  />
                </ol>

                {detail.signature.status === "DITANDATANGANI" && detail.signature.certificateSerial ? (
                  <div className="flex items-start gap-2 rounded-sm border border-approved-line/60 bg-approved-bg px-2.5 py-2">
                    <BadgeCheck className="mt-px size-3.5 shrink-0 text-approved" aria-hidden />
                    <div>
                      <p className="text-2xs font-semibold text-approved">
                        Tersertifikasi Balai Sertifikasi Elektronik (BSrE)
                      </p>
                      <p className="mt-0.5 font-mono text-2xs text-approved/90">
                        {detail.signature.certificateSerial}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-2xs leading-4 text-fg-subtle">
                Pengajuan ini belum diteruskan ke agenda tanda tangan. Setujui berkas terlebih
                dahulu untuk membuat permintaan tanda tangan.
              </p>
            )}

            {canSign ? (
              showSign ? (
                <div className="mt-3 space-y-2 rounded-sm border border-civic/25 bg-civic-soft p-2.5">
                  <label htmlFor="passphrase" className="block text-2xs font-medium text-fg">
                    Frasa sandi sertifikat Kades
                  </label>
                  <input
                    id="passphrase"
                    type="password"
                    autoComplete="off"
                    value={passphrase}
                    onChange={(event) => setPassphrase(event.target.value)}
                    placeholder="Minimal 8 karakter"
                    className="h-8 w-full rounded-sm border border-line-strong bg-surface px-2.5 text-xs focus-visible:border-civic focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic/22"
                  />
                  <p className="text-2xs text-fg-subtle">
                    Frasa sandi diverifikasi terhadap kredensial BSrE pejabat penanda tangan dan
                    tidak pernah disimpan dalam bentuk asli.
                  </p>
                  <p className="rounded-xs border border-line bg-surface px-2 py-1.5 text-2xs leading-4 text-fg-subtle">
                    Lingkungan latihan — frasa sandi Kepala Desa:{" "}
                    <span className="font-mono font-semibold text-fg-muted">
                      {ESIGN_TRAINING_PASSPHRASE}
                    </span>
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={applySignature}
                      disabled={passphrase.length < 8 || signState.isLoading}
                    >
                      {signState.isLoading ? (
                        <LoaderCircle className="animate-spin" aria-hidden />
                      ) : (
                        <Stamp aria-hidden />
                      )}
                      Tandatangani &amp; kunci dokumen
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowSign(false)}>
                      Batal
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  className="mt-3"
                  onClick={() => setShowSign(true)}
                >
                  <PenLine aria-hidden />
                  Tandatangani sebagai Kepala Desa
                </Button>
              )
            ) : null}
          </Section>
        ) : null}

        {/* ========================================================== QR + honour */}
        <Section title="Verifikasi & Arsip" icon={QrCode}>
          <div className="flex items-start gap-3">
            <QrPreview value={detail.verificationCode} />
            <div className="min-w-0 flex-1">
              <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
                Kode verifikasi surat
              </p>
              <p className="mt-0.5 break-all font-mono text-xs font-semibold text-fg">
                {detail.verificationCode}
              </p>
              <p className="mt-1.5 text-2xs leading-4 text-fg-subtle">
                QR pada surat mengarah ke halaman verifikasi publik. Warga dan instansi lain dapat
                memastikan keaslian dokumen ini tanpa menghubungi kantor desa.
              </p>
            </div>
          </div>
        </Section>

        {/* ======================================================= timeline */}
        {detail.timeline.length > 0 ? (
          <Section title="Riwayat Penanganan" icon={Clock3}>
            <ol className="relative space-y-2.5 border-l border-line pl-3.5">
              {detail.timeline.map((entry) => {
                const meta = ACTIVITY_KIND[entry.kind as keyof typeof ACTIVITY_KIND];
                return (
                  <li key={entry.id} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[18px] top-1 size-2 rounded-full border-2 border-surface",
                        TONE_CLASSES[meta?.tone ?? "neutral"].dot,
                      )}
                      aria-hidden
                    />
                    <p className="text-2xs leading-4 text-fg">{entry.summary}</p>
                    <p className="tnum mt-0.5 text-[10px] text-fg-subtle">
                      {entry.actorName} · {entry.actorRole} · {formatDateTime(entry.occurredAt)}
                    </p>
                  </li>
                );
              })}
            </ol>
          </Section>
        ) : null}
      </div>

      {/* ============================================================ footer */}
      <footer className="shrink-0 border-t border-line bg-surface px-4 py-3">
        {showReject ? (
          <div className="mb-2.5 space-y-2">
            <label htmlFor="reject-note" className="block text-2xs font-medium text-fg">
              Alasan pengembalian berkas
            </label>
            <Textarea
              id="reject-note"
              value={rejectNote}
              onChange={(event) => setRejectNote(event.target.value)}
              placeholder="Contoh: Hasil pindai KTP kurang tajam, mohon unggah ulang dengan pencahayaan yang cukup."
              className="min-h-16"
              maxLength={500}
            />
            <p className="text-2xs text-fg-subtle">
              Alasan ini dikirim ke pemohon melalui notifikasi dan tercatat permanen pada jejak audit
              desa.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="secondary" size="sm" asChild>
              <a
                href={letterPdfUrl(detail.id, "draft", 1)}
                target="_blank"
                rel="noreferrer"
                onClick={() => dispatch(uiActions.attachmentPreviewed(null))}
              >
                <Printer aria-hidden />
                Cetak Draft Surat PDF
              </a>
            </Button>

            {canPrintFinal ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon-sm" asChild>
                    <a
                      href={letterPdfUrl(detail.id, "final", 2)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Cetak surat final dua lembar"
                    >
                      <ShieldCheck aria-hidden />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  Cetak surat final (2 lembar: arsip desa + pemohon)
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {showReject ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setShowReject(false)}>
                  Batal
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={verifyState.isLoading || rejectNote.trim().length < 5}
                  onClick={requestRepair}
                >
                  <X aria-hidden />
                  Kirim &amp; minta perbaikan
                </Button>
              </>
            ) : canApprove ? (
              <>
                <Button variant="danger" size="sm" onClick={() => setShowReject(true)}>
                  <X aria-hidden />
                  Tolak / Perbaiki
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={verifyState.isLoading || defectCount > 0}
                  onClick={approve}
                  title={
                    defectCount > 0
                      ? "Perbaiki status berkas terlebih dahulu sebelum menyetujui"
                      : forwardingToKades
                        ? "Berkas lengkap — kirim ke agenda tanda tangan elektronik Kepala Desa"
                        : "Nyatakan seluruh berkas lengkap"
                  }
                >
                  {verifyState.isLoading ? (
                    <LoaderCircle className="animate-spin" aria-hidden />
                  ) : (
                    <Check aria-hidden />
                  )}
                  {forwardingToKades ? "Teruskan ke Kades" : "Setujui Berkas"}
                </Button>
              </>
            ) : (
              <Badge variant="neutral" size="md">
                Tidak ada tindakan tersedia untuk status ini
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2">
          <DocumentBadge
            uploaded={detail.documentsUploaded}
            required={detail.documentsRequired}
            complianceNote={detail.complianceNote}
          />
          <span className="tnum text-2xs text-fg-subtle">
            Petugas: {detail.officer?.fullName ?? "Belum ditugaskan"}
            {detail.officer?.jobTitle ? ` (${detail.officer.jobTitle})` : ""}
          </span>
          <span className="tnum ml-auto text-2xs text-fg-subtle">
            Dibuka {formatRelative(detail.submittedAt, now)}
          </span>
        </div>
      </footer>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function Section({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-line bg-surface px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.045em] text-fg-subtle">
          <Icon className="size-3.5" aria-hidden />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  strong,
  mono,
  hint,
}: {
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-xs leading-4",
          strong ? "font-semibold text-fg" : "text-fg-muted",
          mono && "font-mono tabular-nums tracking-tight",
        )}
        title={value}
      >
        {value}
      </dd>
      {hint ? <p className="tnum mt-0.5 text-[10px] text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

function MetaStat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "neutral" | "approved" | "pending";
  hint: string;
}) {
  return (
    <div
      className={cn(
        "rounded-sm border px-2 py-1.5",
        tone === "neutral" && "border-line bg-surface-muted",
        tone === "approved" && "border-approved-line/60 bg-approved-bg",
        tone === "pending" && "border-pending-line/60 bg-pending-bg",
      )}
      title={hint}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className="tnum mt-0.5 truncate text-xs font-semibold text-fg">{value}</p>
    </div>
  );
}

function SignatureStep({
  title,
  meta,
  time,
  done,
  pending,
}: {
  title: string;
  meta: string;
  time: string | null;
  done?: boolean;
  pending?: boolean;
}) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
          done
            ? "border-approved-solid bg-approved-solid text-white"
            : pending
              ? "border-pending-line bg-pending-bg text-pending"
              : "border-line-strong bg-surface-muted text-fg-subtle",
        )}
        aria-hidden
      >
        {done ? (
          <Check className="size-2.5" />
        ) : (
          <Clock3 className="size-2.5" />
        )}
      </span>
      <div className="min-w-0">
        <p className={cn("text-2xs font-medium", done ? "text-fg" : "text-fg-muted")}>{title}</p>
        <p className="text-[10px] text-fg-subtle">{meta}</p>
        {time ? (
          <p className="tnum text-[10px] text-fg-subtle">{formatDateTime(time)}</p>
        ) : null}
      </div>
    </li>
  );
}

function AttachmentThumb({
  attachment,
  active,
  verdict,
  onSelect,
}: {
  attachment: AttachmentView;
  active: boolean;
  verdict?: LetterAttachmentStatus;
  onSelect: () => void;
}) {
  const flagged = verdict && verdict !== "LENGKAP";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={`Lihat berkas ${attachment.label}`}
      className={cn(
        "group relative flex w-[92px] flex-col gap-1 rounded-sm border p-1.5 text-left transition-colors",
        active
          ? "border-civic bg-civic-soft"
          : flagged
            ? "border-pending-line/70 bg-pending-bg/60 hover:border-pending-solid/60"
            : "border-line bg-surface hover:border-slate-400 hover:bg-surface-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic/45",
      )}
    >
      <span
        className={cn(
          "grid h-12 w-full place-items-center rounded-xs border bg-scan-grid",
          active ? "border-civic/30" : "border-line",
        )}
        aria-hidden
      >
        <IdCard className="size-4 text-slate-400" />
      </span>
      <span className="w-full truncate text-[10px] font-medium leading-3 text-fg" title={attachment.label}>
        {attachment.label}
      </span>
      <AttachmentStatusBadge status={verdict ?? attachment.status} />
      {flagged ? (
        <CircleAlert
          className="absolute right-1 top-1 size-3 text-pending"
          aria-label="Berkas ini bermasalah"
        />
      ) : null}
    </button>
  );
}

/**
 * Scan preview surface.
 *
 * Real deployments stream the stored object here. Because the seed does not
 * ship scanned ID cards, this renders a documented placeholder that mimics the
 * shape of a KTP/KK so the review workflow — including the zoom controls and
 * the per-document verdict — can be exercised end to end.
 */
function ScanPlaceholder({ attachment, zoom }: { attachment: AttachmentView; zoom: number }) {
  return (
    <figure
      className="relative overflow-hidden rounded-sm border border-line-strong bg-surface"
      aria-label={`Pratinjau berkas ${attachment.label}`}
    >
      <div
        className="bg-scan-grid origin-top-left transition-transform duration-200"
        style={{ transform: `scale(${zoom})` }}
      >
        <div className="aspect-[1.586/1] w-full bg-white p-3">
          <div className="flex items-start justify-between border-b border-line pb-1.5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-civic">
                Republik Indonesia
              </p>
              <p className="text-[9px] text-fg-subtle">
                {attachment.docKey === "KK" ? "Kartu Keluarga" : "Kartu Tanda Penduduk"}
              </p>
            </div>
            <span className="grid size-7 place-items-center rounded-xs border border-line bg-surface-muted text-[8px] text-fg-subtle">
              LOGO
            </span>
          </div>

          <div className="mt-2.5 flex gap-3">
            <div className="grid h-12 w-10 shrink-0 place-items-center rounded-xs border border-line bg-surface-muted text-[8px] text-fg-subtle">
              4×6
            </div>
            <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2">
              {["NIK", "Nama", "Tempat/Tgl Lahir", "Jenis Kelamin", "Alamat", "Agama"].map(
                (field) => (
                  <div key={field}>
                    <p className="text-[8px] uppercase tracking-wide text-fg-subtle">{field}</p>
                    <p className="mt-0.5 h-1.5 w-4/5 rounded-full bg-slate-200" aria-hidden />
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      <figcaption className="border-t border-line bg-surface-muted px-2.5 py-1.5 text-[10px] leading-4 text-fg-subtle">
        Berkas asli tersimpan terenkripsi pada penyimpanan desa dan hanya dapat dibuka oleh petugas
        berwenang. Pratinjau di atas adalah kerangka tampilan untuk keperluan demonstrasi alur
        verifikasi.
      </figcaption>
    </figure>
  );
}

function QrPreview({ value }: { value: string }) {
  // A deterministic 21×21 module pattern derived from the code: visually reads
  // as a QR symbol at this size, and is stable across renders for the same code.
  const size = 21;
  const modules = React.useMemo(() => {
    let seed = 0;
    for (let i = 0; i < value.length; i += 1) seed = (seed * 31 + value.charCodeAt(i)) >>> 0;
    const grid: boolean[][] = [];
    for (let row = 0; row < size; row += 1) {
      grid[row] = [];
      for (let col = 0; col < size; col += 1) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        grid[row][col] = ((seed >>> 16) & 1) === 1;
      }
    }
    const finder = (rowOffset: number, colOffset: number) => {
      for (let r = 0; r < 7; r += 1) {
        for (let c = 0; c < 7; c += 1) {
          const edge = r === 0 || r === 6 || c === 0 || c === 6;
          const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[rowOffset + r][colOffset + c] = edge || core;
        }
      }
      // Quiet separator ring, so the finder patterns stay legible.
      for (let i = 0; i < 8; i += 1) {
        if (rowOffset + 7 < size && colOffset + i < size) grid[rowOffset + 7][colOffset + i] = false;
        if (colOffset + 7 < size && rowOffset + i < size) grid[rowOffset + i][colOffset + 7] = false;
      }
    };
    finder(0, 0);
    finder(0, size - 7);
    finder(size - 7, 0);
    return grid;
  }, [value]);

  return (
    <div
      className="grid size-[74px] shrink-0 grid-cols-[repeat(21,1fr)] grid-rows-[repeat(21,1fr)] rounded-xs border border-line bg-white p-1"
      role="img"
      aria-label={`QR verifikasi surat, kode ${value}`}
    >
      {modules.flatMap((row, rowIndex) =>
        row.map((filled, colIndex) => (
          <span
            key={`${rowIndex}-${colIndex}`}
            className={filled ? "bg-ink" : "bg-white"}
            aria-hidden
          />
        )),
      )}
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <>
      <header className="border-b border-line bg-surface px-4 pb-3 pt-3.5 pr-12">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-5 w-28 rounded-full" />
        </div>
        <Skeleton className="mt-2 h-4 w-48" />
        <Skeleton className="mt-1.5 h-3 w-64" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      </header>
      <div className="flex-1 space-y-3 overflow-hidden p-4">
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-8" />
          ))}
        </div>
        <Skeleton className="h-4 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-24 w-[92px]" />
          <Skeleton className="h-24 w-[92px]" />
          <Skeleton className="h-24 flex-1" />
        </div>
      </div>
    </>
  );
}

const PAYLOAD_LABELS: Record<string, string> = {
  dusun: "Dusun",
  rt: "RT",
  rw: "RW",
  lamaDomisili: "Lama Berdomisili",
  usaha: "Nama / Jenis Usaha",
  acara: "Nama Kegiatan",
  jumlahPeserta: "Perkiraan Peserta",
};

