"use client";

import { CircleDashed, CircleCheck, CircleX, LoaderCircle, Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ATTACHMENT_STATUS,
  REQUEST_STATUS,
  TONE_CLASSES,
  type Tone,
} from "@/lib/domain";
import type { LetterAttachmentStatus, RequestStatus } from "@/db/schema";

/* -------------------------------------------------------------------------- */
/* Request status                                                              */
/* -------------------------------------------------------------------------- */

const STATUS_ICON: Partial<Record<RequestStatus, typeof CircleDashed>> = {
  PENDING_VERIFIKASI: CircleDashed,
  BERKAS_TIDAK_LENGKAP: CircleX,
  DIVERIFIKASI: LoaderCircle,
  MENUNGGU_TTD_KADES: Clock3,
  DITANDATANGANI: CircleCheck,
  SIAP_DIAMBIL: CircleCheck,
  SELESAI: CircleCheck,
  DITOLAK: CircleX,
};

/**
 * Status chip for the queue.
 *
 * Colour is never the only signal: each chip carries an icon and a text label,
 * so the status survives greyscale printing and colour-vision deficiency
 * (WCAG 1.4.1 — Use of Colour).
 */
export function RequestStatusBadge({
  status,
  variant = "full",
  className,
}: {
  status: string;
  variant?: "full" | "short";
  className?: string;
}) {
  const meta = REQUEST_STATUS[status as RequestStatus];
  if (!meta) {
    return (
      <Badge variant="neutral" className={className}>
        {status}
      </Badge>
    );
  }

  const Icon = STATUS_ICON[status as RequestStatus] ?? CircleDashed;
  const tone = TONE_CLASSES[meta.tone];

  return (
    <Badge
      variant="outline"
      size="default"
      className={cn(tone.chip, "gap-1.5", className)}
      title={meta.description}
    >
      <Icon
        className={cn(
          "size-3",
          // The "in flight" states get a slow spin, disabled under
          // prefers-reduced-motion by the global base layer.
          status === "DIVERIFIKASI" && "animate-spin [animation-duration:2.6s]",
        )}
        aria-hidden
      />
      <span className="font-medium">{variant === "short" ? meta.short : meta.label}</span>
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/* Document completeness                                                       */
/* -------------------------------------------------------------------------- */

/**
 * "3 Berkas Lengkap" / "KTP Buram".
 *
 * The compliance note takes precedence when present: an officer standing at a
 * counter needs the *defect*, not the count. The count moves to the tooltip.
 */
export function DocumentBadge({
  uploaded,
  required,
  complianceNote,
  className,
  compact = false,
}: {
  uploaded: number;
  required: number;
  complianceNote?: string | null;
  className?: string;
  compact?: boolean;
}) {
  const complete = uploaded >= required;
  const tone: Tone = complianceNote ? "pending" : complete ? "approved" : "rejected";

  const label = complianceNote
    ? complianceNote
    : complete
      ? `${uploaded} Berkas Lengkap`
      : `${uploaded} dari ${required} Berkas`;

  return (
    <Badge
      variant="outline"
      size="default"
      className={cn(TONE_CLASSES[tone].chip, "gap-1.5 font-medium", className)}
      title={
        complianceNote
          ? `${uploaded} dari ${required} berkas terunggah · catatan: ${complianceNote}`
          : `${uploaded} dari ${required} berkas wajib terunggah`
      }
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", TONE_CLASSES[tone].dot)}
      />
      <span className="truncate">{compact && complianceNote ? complianceNote.split(" ")[0] : label}</span>
      {!complete && !compact ? (
        <span className="tnum font-mono text-2xs opacity-80">
          {uploaded}/{required}
        </span>
      ) : null}
    </Badge>
  );
}

export function AttachmentStatusBadge({ status }: { status: string }) {
  const meta = ATTACHMENT_STATUS[status as LetterAttachmentStatus];
  if (!meta) return <Badge variant="neutral">{status}</Badge>;
  return (
    <Badge variant="outline" size="sm" className={TONE_CLASSES[meta.tone].chip} title={meta.hint}>
      {meta.label}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/* Letter type                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Letter-type code chip: SKU, SKCK, SKD, SKM…
 *
 * Always monospace + tabular so a column of codes aligns on a common baseline —
 * officers scan this column continuously all day.
 */
export function LetterTypeBadge({
  code,
  name,
  className,
  showName = true,
}: {
  code: string;
  name?: string;
  className?: string;
  showName?: boolean;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <Badge
        variant="civic"
        size="sm"
        mono
        className="min-w-[2.75rem] justify-center text-[10px] font-bold"
        title={name}
      >
        {code}
      </Badge>
      {showName && name ? (
        <span className="truncate text-xs text-fg" title={name}>
          {name}
        </span>
      ) : null}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Priority                                                                    */
/* -------------------------------------------------------------------------- */

export function PriorityMarker({ priority }: { priority: string }) {
  if (priority === "DARURAT") {
    return (
      <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-rejected">
        <span className="size-1.5 rounded-full bg-rejected-solid pulse-ring" aria-hidden />
        Darurat
      </span>
    );
  }
  if (priority === "PRIORITAS") {
    return (
      <span className="inline-flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide text-pending">
        <span className="size-1.5 rounded-full bg-pending-solid" aria-hidden />
        Prioritas
      </span>
    );
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* SLA countdown                                                               */
/* -------------------------------------------------------------------------- */

export function SlaIndicator({
  slaMinutes,
  label,
  tone,
}: {
  slaMinutes: number | null;
  label: string;
  tone: "safe" | "warning" | "overdue" | "none";
}) {
  if (tone === "none" || slaMinutes === null) {
    return <span className="text-2xs text-fg-subtle">—</span>;
  }

  const tones = {
    safe: "text-fg-muted",
    warning: "text-pending",
    overdue: "text-rejected font-semibold",
  } as const;

  return (
    <span
      className={cn("tnum inline-flex items-center gap-1 text-2xs", tones[tone])}
      title={`Batas waktu penyelesaian: ${label}`}
    >
      <Clock3 className="size-3" aria-hidden />
      {label}
    </span>
  );
}
