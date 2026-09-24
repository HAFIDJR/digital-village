"use client";

import {
  Check,
  CircleAlert,
  ExternalLink,
  Globe,
  LoaderCircle,
  Megaphone,
  Pin,
  Send,
  ShieldAlert,
  Users,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Checkbox,
  Field,
  Input,
  Switch,
  Textarea,
} from "@/components/ui/primitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ANNOUNCEMENT_CHANNEL, ANNOUNCEMENT_STATUS, TONE_CLASSES } from "@/lib/domain";
import { formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { announcementDraftSchema, type AnnouncementDraft } from "@/lib/validators";
import type { AnnouncementEntry } from "@/db/queries";
import { errorFields, errorMessage, usePublishAnnouncementMutation } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store";
import { uiActions } from "@/store/ui-slice";
import { useNow } from "./now-context";
import { toastFromMutation } from "./feedback";

/** Character budget for a notice that must stay readable on a phone. */
const BODY_TARGET = 480;

const QUICK_TEMPLATES: { label: string; title: string; body: string; channel: AnnouncementDraft["channel"] }[] = [
  {
    label: "Pelayanan loket tutup",
    title: "Pelayanan Loket Desa Tutup Sementara",
    channel: "WEBSITE_DESA",
    body: "Diberitahukan kepada seluruh warga bahwa pelayanan loket Kantor Desa Sukamaju pada hari ini ditutup sementara karena kegiatan rapat koordinasi perangkat desa di Kecamatan Cimaung. Pelayanan akan dibuka kembali pada hari kerja berikutnya pukul 08.00 WIB. Pengajuan surat melalui website tetap dapat dilakukan dan akan diproses sesuai urutan antrean. Mohon maaf atas ketidaknyamanannya.",
  },
  {
    label: "Pengumuman BLT",
    title: "Jadwal Penyaluran Bantuan Sosial Desa",
    channel: "WEBSITE_DESA",
    body: "Penyaluran bantuan sosial desa akan dilaksanakan di Balai Desa Sukamaju. Penerima manfaat diharapkan hadir sesuai jadwal dusun masing-masing dengan membawa Kartu Tanda Penduduk dan Kartu Keluarga asli. Warga yang berhalangan hadir dapat mengirimkan perwakilan dengan membawa surat kuasa bermaterai. Jadwal lengkap per dusun dapat dilihat pada papan informasi RT/RW.",
  },
  {
    label: "Kerja bakti",
    title: "Undangan Kerja Bakti Bersama",
    channel: "PENGUMUMAN_WA",
    body: "Seluruh warga diundang untuk mengikuti kerja bakti bersama pada hari Minggu pukul 07.00 WIB. Titik kumpul berada di masing-masing balai RW. Warga diharapkan membawa peralatan kebersihan seperlunya. Konsumsi ringan disediakan oleh pengurus PKK desa. Mari jaga kebersihan lingkungan demi kesehatan bersama.",
  },
];

/**
 * Quick announcement composer.
 *
 * The brief calls this "push urgent broadcasts directly to the public website",
 * so the form is optimised for *speed under interruption*: three one-click
 * templates, a minimal field set, and inline validation that names the exact
 * problem. An officer composing this while a citizen waits should not have to
 * think about formatting.
 */
export function AnnouncementComposer({
  announcements,
  loading,
  canPublish = true,
}: {
  announcements: AnnouncementEntry[];
  loading: boolean;
  /** Derived from the acting officer's role; the API enforces the same rule. */
  canPublish?: boolean;
}) {
  const dispatch = useAppDispatch();
  const now = useNow();
  const errors = useAppSelector((state) => state.ui.announcementErrors);
  const [publish, publishState] = usePublishAnnouncementMutation();

  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [channel, setChannel] = React.useState<AnnouncementDraft["channel"]>("WEBSITE_DESA");
  const [status, setStatus] = React.useState<AnnouncementDraft["status"]>("TERBIT");
  const [pinned, setPinned] = React.useState(false);
  const [urgent, setUrgent] = React.useState(false);
  const [toastOnPublish, setToastOnPublish] = React.useState(true);

  const bodyOverTarget = body.length > BODY_TARGET;
  const canSubmit = canPublish && title.trim().length >= 8 && body.trim().length >= 20;

  const applyTemplate = (template: (typeof QUICK_TEMPLATES)[number]) => {
    setTitle(template.title);
    setBody(template.body);
    setChannel(template.channel);
    dispatch(uiActions.announcementErrorsCleared());
  };

  const reset = () => {
    setTitle("");
    setBody("");
    setPinned(false);
    setUrgent(false);
    dispatch(uiActions.announcementErrorsCleared());
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    dispatch(uiActions.announcementErrorsCleared());

    // Client-side parse first: the officer sees the problem without a round trip.
    const candidate = {
      title,
      body,
      channel,
      status,
      priority: urgent ? ("PRIORITAS" as const) : ("NORMAL" as const),
      pinned,
      audience: "Seluruh Warga",
    };

    const parsed = announcementDraftSchema.safeParse(candidate);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_form";
        fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
      }
      dispatch(uiActions.announcementErrorsSet(fieldErrors));
      return;
    }

    try {
      const result = await publish(parsed.data).unwrap();
      toastFromMutation(dispatch, {
        tone: "success",
        title: "Pengumuman diterbitkan",
        body: `"${result.announcement.title}" kini tampil pada ${ANNOUNCEMENT_CHANNEL[result.announcement.channel]?.label ?? "kanal desa"}.`,
      });
      if (toastOnPublish) reset();
    } catch (mutationError) {
      const fields = errorFields(mutationError);
      dispatch(uiActions.announcementErrorsSet(fields));
      toastFromMutation(dispatch, {
        tone: "danger",
        title: "Pengumuman gagal diterbitkan",
        body: errorMessage(mutationError),
      });
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5">
          {/* --- permission notice --------------------------------------- */}
          {!canPublish ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-sm border border-pending-line bg-pending-bg px-2.5 py-2 text-2xs leading-4 text-pending"
            >
              <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              Jabatan Anda saat ini hanya dapat membaca pengumuman. Penerbitan pengumuman desa
              dilakukan oleh Sekretaris Desa, Kaur Tata Usaha, atau petugas loket pelayanan.
            </p>
          ) : null}

          {/* --- channel ------------------------------------------------- */}
          <div>
            <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
              Saluran publikasi
            </span>
            <div
              role="radiogroup"
              aria-label="Saluran publikasi pengumuman"
              className="grid gap-1.5"
            >
              {(Object.keys(ANNOUNCEMENT_CHANNEL) as AnnouncementDraft["channel"][]).map((key) => {
                const meta = ANNOUNCEMENT_CHANNEL[key];
                const active = channel === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setChannel(key)}
                    className={cn(
                      "flex items-start gap-2 rounded-sm border px-2.5 py-2 text-left transition-colors",
                      active
                        ? "border-civic bg-civic-soft"
                        : "border-line bg-surface hover:border-slate-400 hover:bg-surface-muted",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic/45",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full border",
                        active ? "border-civic bg-civic" : "border-line-strong bg-surface",
                      )}
                      aria-hidden
                    >
                      {active ? <Check className="size-2.5 text-white" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-fg">{meta.label}</span>
                      <span className="mt-0.5 block text-[10px] leading-4 text-fg-subtle">
                        {meta.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* --- quick templates ----------------------------------------- */}
          <div>
            <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
              Templat cepat
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TEMPLATES.map((template) => (
                <button
                  key={template.label}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className={cn(
                    "h-[24px] rounded-full border border-line-strong bg-surface px-2.5 text-2xs font-medium text-fg-muted",
                    "transition-colors hover:border-civic/40 hover:bg-civic-soft hover:text-civic",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic/45",
                  )}
                >
                  {template.label}
                </button>
              ))}
            </div>
          </div>

          <Field
            label="Judul pengumuman"
            htmlFor="announcement-title"
            required
            error={errors.title?.[0]}
            hint="Judul tampil pada beranda website desa dan papan informasi."
            counter={`${title.length}/200`}
          >
            <Input
              id="announcement-title"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Contoh: Jadwal Pelayanan Loket Selama Bulan Puasa"
              aria-invalid={Boolean(errors.title)}
            />
          </Field>

          <Field
            label="Isi pengumuman"
            htmlFor="announcement-body"
            required
            error={errors.body?.[0]}
            hint={
              bodyOverTarget
                ? "Isi cukup panjang — pertimbangkan menyingkat agar mudah dibaca di ponsel warga."
                : "Tulis dengan bahasa yang jelas dan sebutkan tanggal serta lokasi bila ada."
            }
            counter={`${body.length} karakter${bodyOverTarget ? " · cukup panjang" : ""}`}
          >
            <Textarea
              id="announcement-body"
              value={body}
              maxLength={4000}
              rows={7}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Tulis isi pengumuman selengkapnya…"
              aria-invalid={Boolean(errors.body)}
              className={cn("min-h-[9.5rem]", bodyOverTarget && "border-pending-line")}
            />
          </Field>

          {/* --- options ------------------------------------------------- */}
          <div className="space-y-2 rounded-sm border border-line bg-surface-muted p-2.5">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-xs font-medium text-fg">
                  <Pin className="size-3.5 text-fg-subtle" aria-hidden />
                  Sematkan di beranda
                </span>
                <span className="mt-0.5 block text-[10px] leading-4 text-fg-subtle">
                  Pengumuman tersemat tampil paling atas selama 30 hari.
                </span>
              </span>
              <Switch
                checked={pinned}
                onCheckedChange={setPinned}
                aria-label="Sematkan pengumuman di beranda"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-xs font-medium text-fg">
                  <CircleAlert className="size-3.5 text-fg-subtle" aria-hidden />
                  Tandai sebagai prioritas
                </span>
                <span className="mt-0.5 block text-[10px] leading-4 text-fg-subtle">
                  Diberi label prioritas dan diteruskan ke grup koordinasi RT/RW.
                </span>
              </span>
              <Switch
                checked={urgent}
                onCheckedChange={setUrgent}
                aria-label="Tandai pengumuman sebagai prioritas"
              />
            </label>

            <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
              <span className="text-[10px] leading-4 text-fg-subtle">
                Kosongkan formulir otomatis setelah berhasil diterbitkan.
              </span>
              <Checkbox
                checked={toastOnPublish}
                onChange={(event) => setToastOnPublish(event.target.checked)}
                aria-label="Kosongkan formulir setelah pengumuman diterbitkan"
              />
            </div>
          </div>

          {/* --- validation summary ------------------------------------- */}
          {errors._form?.length ? (
            <p
              role="alert"
              className="flex items-start gap-1.5 rounded-sm border border-rejected-line/60 bg-rejected-bg px-2.5 py-2 text-2xs text-rejected"
            >
              <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {errors._form[0]}
            </p>
          ) : null}

          {/* --- recent announcements ------------------------------------ */}
          <div>
            <span className="mb-1.5 block text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
              Pengumuman terakhir
            </span>
            {loading ? (
              <div className="space-y-1.5">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-9 rounded-sm border border-line bg-surface-muted" />
                ))}
              </div>
            ) : announcements.length === 0 ? (
              <p className="rounded-sm border border-dashed border-line-strong px-3 py-3 text-center text-2xs text-fg-subtle">
                Belum ada pengumuman yang diterbitkan.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {announcements.slice(0, 4).map((item) => {
                  const statusMeta = ANNOUNCEMENT_STATUS[item.status] ?? {
                    label: item.status,
                    tone: "neutral" as const,
                  };
                  return (
                    <li
                      key={item.id}
                      className="rounded-sm border border-line bg-surface px-2.5 py-2 transition-colors hover:bg-surface-muted"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-2xs font-medium text-fg" title={item.title}>
                          {item.title}
                        </p>
                        <Badge
                          variant="outline"
                          size="sm"
                          className={cn("shrink-0", TONE_CLASSES[statusMeta.tone].chip)}
                        >
                          {statusMeta.label}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-fg-subtle">
                        {item.pinned ? (
                          <span className="flex items-center gap-0.5 text-civic">
                            <Pin className="size-2.5" aria-hidden />
                            Tersemat
                          </span>
                        ) : null}
                        <span className="tnum">
                          {item.publishAt
                            ? formatRelative(item.publishAt, now)
                            : "belum terbit"}
                        </span>
                        {item.viewCount > 0 ? (
                          <>
                            <span aria-hidden>·</span>
                            <span className="tnum flex items-center gap-0.5">
                              <Users className="size-2.5" aria-hidden />
                              {formatNumber(item.viewCount)} dibaca
                            </span>
                          </>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* --- footer actions ------------------------------------------- */}
        <div className="flex items-center justify-between gap-2 border-t border-line bg-surface px-3.5 py-2.5">
          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  type="button"
                  aria-label="Ubah status publikasi"
                >
                  {status === "TERBIT" ? "Terbitkan sekarang" : "Simpan sebagai draf"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Status publikasi</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setStatus("TERBIT")}>
                  <Globe aria-hidden />
                  Terbitkan sekarang
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setStatus("DRAF")}>
                  <Megaphone aria-hidden />
                  Simpan sebagai draf
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 text-[10px] text-fg-subtle">
                  <ExternalLink className="size-3" aria-hidden />
                  sukamaju.desa.id
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Pengumuman berstatus terbit langsung tampil pada halaman beranda website desa.
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={publishState.isLoading}>
              Kosongkan
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!canSubmit || publishState.isLoading}
              title={
                !canPublish
                  ? "Jabatan Anda tidak berwenang menerbitkan pengumuman desa"
                  : canSubmit
                    ? undefined
                    : "Lengkapi judul (min. 8 karakter) dan isi (min. 20 karakter)"
              }
            >
              {publishState.isLoading ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <Send aria-hidden />
              )}
              {status === "TERBIT" ? "Terbitkan" : "Simpan Draf"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
