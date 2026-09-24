"use client";

import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store";
import { uiActions, type UiState } from "@/store/ui-slice";

type Tone = NonNullable<UiState["toast"]>["tone"];

const TONES: Record<
  Tone,
  { icon: typeof CircleCheck; className: string; iconClass: string; role: "status" | "alert" }
> = {
  success: {
    icon: CircleCheck,
    className: "border-approved-line bg-approved-bg text-approved",
    iconClass: "text-approved-solid",
    role: "status",
  },
  danger: {
    icon: CircleAlert,
    className: "border-rejected-line bg-rejected-bg text-rejected",
    iconClass: "text-rejected-solid",
    role: "alert",
  },
  warning: {
    icon: TriangleAlert,
    className: "border-pending-line bg-pending-bg text-pending",
    iconClass: "text-pending-solid",
    role: "status",
  },
  info: {
    icon: Info,
    className: "border-progress-line bg-progress-bg text-progress",
    iconClass: "text-progress-solid",
    role: "status",
  },
};

/**
 * Dispatches a confirmation banner from inside an RTK Query callback.
 *
 * The banner lives in the `ui` slice rather than in the mutation's own state so
 * that a decision taken from a table row survives the row re-rendering — which
 * it does, immediately, because the mutation invalidates the queue.
 */
export function toastFromMutation(
  dispatch: ReturnType<typeof useAppDispatch>,
  payload: { tone: Tone; title: string; body?: string },
) {
  dispatch(
    uiActions.toastShown({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...payload,
    }),
  );
}

/**
 * Toast host.
 *
 * Pinned to the bottom-right, above the table, and never covers the action
 * column. Auto-dismisses after 8s — long enough to read a sentence, short
 * enough not to block a queue of decisions — but errors stay until dismissed,
 * because a failed approval must not silently scroll away.
 */
export function ToastHost() {
  const toast = useAppSelector((state) => state.ui.toast);
  const dispatch = useAppDispatch();

  React.useEffect(() => {
    if (!toast) return;
    const ttl = toast.tone === "danger" ? 0 : 8000;
    if (ttl === 0) return;
    const timer = window.setTimeout(() => dispatch(uiActions.toastDismissed()), ttl);
    return () => window.clearTimeout(timer);
  }, [toast, dispatch]);

  if (!toast) return null;

  const meta = TONES[toast.tone];
  const Icon = meta.icon;

  return (
    <div
      role={meta.role}
      aria-live={meta.role === "alert" ? "assertive" : "polite"}
      className="pointer-events-none fixed bottom-4 right-4 z-[80] w-[min(24rem,calc(100vw-2rem))]"
    >
      <div
        className={cn(
          "pointer-events-auto flex items-start gap-2.5 rounded-md border bg-surface p-3 shadow-layer-2",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2",
        )}
      >
        <Icon className={cn("mt-0.5 size-4 shrink-0", meta.iconClass)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={cn("text-xs font-semibold leading-4", meta.className.split(" ")[2])}>
            {toast.title}
          </p>
          {toast.body ? (
            <p className="mt-0.5 text-2xs leading-4 text-fg-muted">{toast.body}</p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => dispatch(uiActions.toastDismissed())}
          aria-label="Tutup notifikasi"
        >
          <X aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/**
 * Inline error panel used beside a failed query.
 */
export function QueryErrorState({
  title = "Gagal memuat data",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 border-b border-rejected-line/40 bg-rejected-bg/70 px-3.5 py-3"
    >
      <div className="flex items-start gap-2">
        <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-rejected" aria-hidden />
        <div>
          <p className="text-xs font-semibold text-rejected">{title}</p>
          <p className="mt-0.5 text-2xs leading-4 text-rejected/90">{message}</p>
        </div>
      </div>
      {onRetry ? (
        <Button variant="danger" size="xs" onClick={onRetry}>
          Coba lagi
        </Button>
      ) : null}
    </div>
  );
}
