import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export type ConfirmTone = "danger" | "warning" | "neutral";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tone?: ConfirmTone;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  description: string;
  details?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  loading?: boolean;
  error?: string;
  onConfirm: () => void;
}

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
  loading,
  error,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="rounded-sm border bg-surface p-4"
        role="alertdialog"
        aria-labelledby="confirm-title"
      >
        <div>
          <h3 id="confirm-title" className="font-display text-sm font-bold text-fg">
            {title}
          </h3>
          <p className="mt-1 text-2xs text-fg-subtle">{description}</p>
        </div>

        {details ? (
          <div className="mt-3 p-3 rounded-sm border border-line bg-surface-muted">
            <dl className="grid gap-x-2 gap-y-1">
              {Array.isArray(details as any[]) ? (
                (details as any[]).map((detail, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <dt className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">Detail {i + 1}</dt>
                    <dd className="text-2xs text-fg-muted">{detail}</dd>
                  </div>
                ))
              ) : (
                <div>
                  <dt className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">Detail</dt>
                  <dd className="text-2xs text-fg-muted">{details}</dd>
                </div>
              )}
            </dl>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-1.5 border-t border-line pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {loading ? (
              <span className="size-4 animate-spin" aria-hidden />
            ) : (
              <span aria-hidden />
            )}
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <span className="size-4 animate-spin" aria-hidden />
            ) : (
              <span aria-hidden />
            )}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}