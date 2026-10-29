"use client";

import { CircleAlert, LoaderCircle, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { TONE_CLASSES } from "@/lib/domain";
import { cn } from "@/lib/utils";

export type ConfirmTone = "danger" | "warning" | "neutral";

const TONE_ICON: Record<ConfirmTone, LucideIcon> = {
  danger: CircleAlert,
  warning: TriangleAlert,
  neutral: TriangleAlert,
};

const TONE_CHIP: Record<ConfirmTone, string> = {
  danger: TONE_CLASSES.rejected.chip,
  warning: TONE_CLASSES.pending.chip,
  neutral: TONE_CLASSES.neutral.chip,
};

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tone?: ConfirmTone;
  icon?: LucideIcon;
  title: string;
  description: string;
  details?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  tone = "danger",
  icon,
  title,
  description,
  details,
  confirmLabel,
  cancelLabel = "Batal",
  loading = false,
  error = null,
  onConfirm,
}: ConfirmDialogProps) {
  const Icon = icon ?? TONE_ICON[tone];
  const confirmVariant = tone === "danger" ? "danger" : "primary";

  return (
    <Dialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
      <DialogContent
        labelledBy="confirm-dialog-title"
        describedBy="confirm-dialog-desc"
        role="alertdialog"
        className="max-w-md p-5"
      >
        <div className="flex items-start gap-2.5 pr-6">
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-sm border",
              TONE_CHIP[tone],
            )}
            aria-hidden
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <h2
              id="confirm-dialog-title"
              className="font-display text-sm font-bold tracking-[-0.01em] text-fg"
            >
              {title}
            </h2>
            <p
              id="confirm-dialog-desc"
              className="mt-1 text-2xs leading-4 text-fg-subtle"
            >
              {description}
            </p>
          </div>
        </div>

        {details ? (
          <div className="mt-3 rounded-sm border border-line bg-surface-muted px-2.5 py-2 text-2xs">
            {details}
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="mt-3 flex items-start gap-1.5 rounded-sm border border-rejected-line/60 bg-rejected-bg px-2.5 py-2 text-2xs text-rejected"
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
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            size="sm"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <Icon aria-hidden />
            )}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}