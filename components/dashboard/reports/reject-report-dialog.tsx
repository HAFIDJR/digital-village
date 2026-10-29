"use client";

import { CircleAlert, LoaderCircle, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { reportAdvanceSchema } from "@/lib/validators";
import { errorMessage, useAdvanceReportMutation } from "@/store/api";

const REJECTION_PRESETS = [
  "Di luar kewenangan desa.",
  "Laporan duplikat — kejadian yang sama sudah memiliki tiket lain.",
  "Data tidak lengkap atau lokasi tidak dapat diverifikasi.",
  "Menyangkut properti pribadi, bukan fasilitas umum desa.",
] as const;

export function RejectReportDialog({
  reportId,
  ticket,
  subject,
  open,
  onOpenChange,
  onRejected,
}: {
  reportId: string;
  ticket: string;
  subject: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRejected?: () => void;
}) {
  const [advance, advanceState] = useAdvanceReportMutation();
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason("");
      setError(null);
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const parsed = reportAdvanceSchema.safeParse({
      status: "REJECTED",
      reason,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Alasan penolakan tidak valid.");
      return;
    }

    try {
      await advance({ id: reportId, body: parsed.data }).unwrap();
      onRejected?.();
      onOpenChange(false);
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    }
  };

  return (
    <Dialog open={open} onOpenChange={advanceState.isLoading ? undefined : onOpenChange}>
      <DialogContent
        labelledBy="reject-report-title"
        describedBy="reject-report-desc"
        className="max-w-md p-5"
      >
        <form onSubmit={submit} noValidate>
          <div className="mb-4 flex items-start gap-2.5 pr-6">
            <span className="grid size-8 shrink-0 place-items-center rounded-sm border border-rejected/30 bg-rejected-bg text-rejected">
              <X className="size-4" aria-hidden />
            </span>
            <div>
              <h2
                id="reject-report-title"
                className="font-display text-sm font-bold tracking-[-0.01em] text-fg"
              >
                Tolak Laporan {ticket}
              </h2>
              <p id="reject-report-desc" className="mt-0.5 text-2xs leading-4 text-fg-subtle">
                “{subject}” akan ditutup sebagai Ditolak. Alasan tertulis wajib
                diisi — pelapor melihatnya di portal warga dan perangkat desa
                lain akan diberi tahu.
              </p>
            </div>
          </div>

          <div className="mb-3 flex flex-wrap gap-1">
            {REJECTION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setReason(preset)}
                disabled={advanceState.isLoading}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] leading-4 transition-colors",
                  reason === preset
                    ? "border-rejected/40 bg-rejected-bg text-rejected"
                    : "border-line bg-surface text-fg-subtle hover:border-line-strong hover:text-fg",
                )}
              >
                {preset}
              </button>
            ))}
          </div>

          <Field
            label="Alasan penolakan"
            htmlFor="reject-report-reason"
            required
            error={undefined}
            hint="10–500 karakter. Jelaskan agar pelapor tahu langkah berikutnya."
          >
            <Textarea
              id="reject-report-reason"
              value={reason}
              rows={4}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Contoh: Laporan duplikat — kejadian yang sama sudah dilaporkan dengan tiket LPR-1042 dan sedang dikerjakan."
              aria-invalid={Boolean(error)}
            />
          </Field>
          <p className="tnum mt-1 text-right text-[10px] text-fg-subtle">
            {reason.trim().length}/500
          </p>

          {error ? (
            <p
              role="alert"
              className="mt-2 flex items-start gap-1.5 rounded-sm border border-rejected-line/60 bg-rejected-bg px-2.5 py-2 text-2xs text-rejected"
            >
              <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex items-center justify-end gap-1.5 border-t border-line pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={advanceState.isLoading}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              disabled={advanceState.isLoading || reason.trim().length < 10}
            >
              {advanceState.isLoading ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <X aria-hidden />
              )}
              Tolak laporan
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}