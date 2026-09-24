"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Input / Textarea                                                            */
/* -------------------------------------------------------------------------- */

export const inputClasses = [
  "flex h-8 w-full min-w-0 rounded-sm border border-line-strong bg-surface px-2.5 text-xs text-fg",
  "transition-colors placeholder:text-fg-subtle",
  "hover:border-slate-400",
  "focus-visible:outline-none focus-visible:border-civic focus-visible:ring-2 focus-visible:ring-civic/22",
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70",
  "aria-invalid:border-rejected-solid aria-invalid:ring-2 aria-invalid:ring-rejected-solid/18",
].join(" ");

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(inputClasses, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(inputClasses, "h-auto min-h-20 resize-y py-2 leading-5", className)}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Field — label + hint + error, wired for screen readers                      */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
  counter,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
  counter?: string;
}) {
  const describedBy = [hint ? `${htmlFor}-hint` : null, error ? `${htmlFor}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-xs font-medium text-fg">
          {label}
          {required ? (
            <span className="ml-0.5 text-rejected-solid" aria-hidden="true">
              *
            </span>
          ) : null}
          {required ? <span className="sr-only"> (wajib diisi)</span> : null}
        </label>
        {counter ? <span className="text-2xs text-fg-subtle tnum">{counter}</span> : null}
      </div>
      <div aria-describedby={describedBy || undefined}>{children}</div>
      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-2xs leading-4 text-fg-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="flex items-start gap-1 text-2xs leading-4 text-rejected"
        >
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Checkbox — Radix-compatible, but dependency-free for the filter rail        */
/* -------------------------------------------------------------------------- */

export function Checkbox({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "size-3.5 shrink-0 cursor-pointer appearance-none rounded-xs border border-line-strong bg-surface",
        "transition-colors checked:border-civic checked:bg-civic",
        "checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M3.5 8.5 6.5 11.5 12.5 4.5%22/></svg>')] checked:bg-center checked:bg-no-repeat",
        "hover:border-slate-400",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic/45",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Switch                                                                      */
/* -------------------------------------------------------------------------- */

export function Switch({
  className,
  checked,
  onCheckedChange,
  disabled,
  id,
  "aria-label": ariaLabel,
}: {
  className?: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic/55 focus-visible:ring-offset-1",
        checked ? "border-civic bg-civic" : "border-line-strong bg-surface-sunken",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none block size-3 rounded-full bg-white shadow-layer-1 transition-transform",
          checked ? "translate-x-[15px]" : "translate-x-[2px]",
        )}
      />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Separator                                                                   */
/* -------------------------------------------------------------------------- */

export function Separator({
  orientation = "horizontal",
  className,
}: {
  orientation?: "horizontal" | "vertical";
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-line",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Avatar                                                                      */
/* -------------------------------------------------------------------------- */

export function Avatar({
  initials,
  className,
  tone = "neutral",
  title,
}: {
  initials: string;
  className?: string;
  tone?: "neutral" | "civic" | "ink" | "approved" | "pending";
  title?: string;
}) {
  const tones = {
    neutral: "border-line-strong bg-surface-muted text-fg-muted",
    civic: "border-civic/25 bg-civic-soft text-civic",
    ink: "border-ink bg-ink text-white",
    approved: "border-approved-line bg-approved-bg text-approved",
    pending: "border-pending-line bg-pending-bg text-pending",
  } as const;

  return (
    <span
      title={title}
      aria-hidden={title ? undefined : true}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-2xs font-semibold tracking-tight",
        tones[tone],
        className,
      )}
    >
      {initials}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                    */
/* -------------------------------------------------------------------------- */

export function Progress({
  value,
  tone = "civic",
  className,
  label,
}: {
  value: number;
  tone?: "civic" | "approved" | "pending" | "rejected";
  className?: string;
  label?: string;
}) {
  const bounded = Math.min(100, Math.max(0, value));
  const tones = {
    civic: "bg-civic",
    approved: "bg-approved-solid",
    pending: "bg-pending-solid",
    rejected: "bg-rejected-solid",
  } as const;

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(bounded)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-1 w-full overflow-hidden rounded-full bg-surface-sunken", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300", tones[tone])}
        style={{ width: `${bounded}%` }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeleton                                                                    */
/* -------------------------------------------------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "skeleton-shimmer relative overflow-hidden rounded-xs",
        "after:skeleton-shimmer-after",
        className,
      )}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Panel — the signature container of this design system                       */
/* -------------------------------------------------------------------------- */

export function Panel({
  children,
  className,
  id,
  as: Comp = "section",
}: {
  children: React.ReactNode;
  className?: string;
  /** Set when the panel is an in-page anchor target for the sidebar. */
  id?: string;
  as?: React.ElementType;
}) {
  return (
    <Comp id={id} className={cn("panel flex flex-col overflow-hidden", className)}>
      {children}
    </Comp>
  );
}

export function PanelHeader({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex min-h-11 items-center justify-between gap-3 border-b border-line bg-surface px-3.5 py-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon ? (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-sm border border-line bg-surface-muted text-fg-subtle">
            <Icon className="size-3.5" aria-hidden />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate font-display text-[13px] font-semibold leading-5 text-fg">
            {title}
          </h2>
          {description ? (
            <p className="truncate text-2xs leading-4 text-fg-subtle">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-1.5">{action}</div> : null}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Keyboard key hint                                                           */
/* -------------------------------------------------------------------------- */

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border border-line-strong",
        "bg-surface-muted px-1 font-sans text-2xs font-medium text-fg-subtle",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
