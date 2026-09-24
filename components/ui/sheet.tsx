"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Sheet — the slide-over used to review a citizen's document.
 *
 * Accessibility contract (WCAG 2.2):
 *  - focus is trapped while open and restored to the trigger on close (Radix);
 *  - Escape closes, clicking the scrim closes;
 *  - the panel is labelled by its own heading, never by a bare icon;
 *  - the scrim is a solid ~40% ink wash, not a blur or gradient.
 */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({
  className,
  children,
  side = "right",
  labelledBy,
  description,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  side?: "right" | "left";
  labelledBy?: string;
  description?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-50 bg-ink/40",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        )}
      />
      <DialogPrimitive.Content
        aria-labelledby={labelledBy}
        aria-describedby={description ? `${labelledBy}-desc` : undefined}
        className={cn(
          "fixed inset-y-0 z-50 flex w-full flex-col border-line bg-canvas shadow-layer-3 outline-none",
          "sm:max-w-[min(46rem,94vw)]",
          side === "right" ? "right-0 border-l" : "left-0 border-r",
          side === "right"
            ? "data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right"
            : "data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left",
          "data-[state=open]:duration-200 data-[state=closed]:duration-150",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className={cn(
            "absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-sm border border-line-strong",
            "bg-surface text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic/55",
          )}
          aria-label="Tutup panel tinjauan"
        >
          <X className="size-3.5" aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("font-display text-sm font-semibold leading-5 text-fg", className)}
      {...props}
    />
  );
}

export function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-2xs leading-4 text-fg-subtle", className)}
      {...props}
    />
  );
}
