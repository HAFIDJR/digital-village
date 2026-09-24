"use client";

import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  Search,
  X,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input, Kbd, Skeleton } from "@/components/ui/primitives";
import { TONE_CLASSES, type Tone } from "@/lib/domain";
import { formatNumber } from "@/lib/format";
import { PAGE_SIZES } from "@/lib/validators";
import { cn } from "@/lib/utils";

/**
 * Page furniture shared by every route inside the shell.
 *
 * These are deliberately *presentational*: none of them own server state or
 * dispatch on their own. A route decides what a filter means (Redux slice, URL,
 * local state) and passes the value and the callback down, so the same toolbar
 * can drive the letter worklist, the reports register and the population
 * registry without any of them leaking into each other.
 */

/* -------------------------------------------------------------------------- */
/* Page header                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The operational header of a sub-page.
 *
 * Deliberately a light band, not the dark hero used on the landing route: an
 * officer who navigates twenty times a day needs the content to be the loudest
 * thing on screen, and thirteen dark ribbons would turn the shell into a
 * slideshow.
 */
export function PageHeader({
  title,
  description,
  icon: Icon,
  eyebrow,
  actions,
  meta,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  eyebrow?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="panel overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-3.5 py-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm border border-civic/20 bg-civic-soft text-civic">
              <Icon className="size-4" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="font-display text-[15px] font-bold leading-6 tracking-[-0.015em] text-fg">
              {title}
            </h1>
            {description ? (
              <p className="mt-0.5 max-w-3xl text-2xs leading-4 text-fg-muted">{description}</p>
            ) : null}
          </div>
        </div>

        {actions || meta ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {meta}
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/* Stat cards                                                                  */
/* -------------------------------------------------------------------------- */

export function StatStrip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>
  );
}

/**
 * One figure an officer can quote.
 *
 * `onClick` turns the card into a filter shortcut rather than a dead
 * decoration — clicking "Belum ditanggapi" has to actually narrow the table
 * below it, or the card is just a number with a border.
 */
export function StatCard({
  label,
  value,
  unit,
  hint,
  tone = "neutral",
  icon: Icon,
  onClick,
  active,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: Tone;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">
          {label}
        </p>
        {Icon ? (
          <span
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-xs border",
              TONE_CLASSES[tone].softBorder,
              tone === "neutral" ? "bg-surface-muted text-fg-subtle" : TONE_CLASSES[tone].chip,
            )}
          >
            <Icon className="size-3" aria-hidden />
          </span>
        ) : null}
      </div>

      <p className="mt-1.5 flex items-baseline gap-1">
        <span className="tnum font-display text-xl font-bold leading-none tracking-[-0.02em] text-fg">
          {value}
        </span>
        {unit ? <span className="text-2xs font-medium text-fg-subtle">{unit}</span> : null}
      </p>

      {hint ? <p className="mt-1 text-[10px] leading-4 text-fg-subtle">{hint}</p> : null}
    </>
  );

  if (!onClick) {
    return <div className="panel px-3.5 py-3">{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={active ? "Klik untuk melepas saringan" : "Klik untuk menyaring tabel"}
      className={cn(
        "panel px-3.5 py-3 text-left transition-colors",
        "hover:border-slate-300 hover:bg-surface-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic/45",
        active && "border-civic/40 bg-civic-soft",
      )}
    >
      {body}
      {active ? (
        <span className="mt-2 flex items-center gap-1 text-[10px] font-medium text-civic" aria-hidden>
          <Check className="size-2.5" />
          Saringan aktif — klik untuk melepas
        </span>
      ) : null}
    </button>
  );
}

/** Compact inline figure row used inside panels (e.g. reports summary). */
export function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line px-3.5 py-2 last:border-b-0">
      <span className="text-2xs text-fg-muted">{label}</span>
      <span
        className={cn(
          "tnum font-mono text-xs font-semibold",
          tone === "neutral" ? "text-fg" : TONE_CLASSES[tone].text,
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toolbar                                                                     */
/* -------------------------------------------------------------------------- */

export function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line bg-surface px-3.5 py-2.5">
      {children}
    </div>
  );
}

export function ToolbarRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <div className="relative min-w-[15rem] flex-1">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle"
        aria-hidden
      />
      <Input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="pl-8 pr-10"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-xs text-fg-subtle hover:bg-surface-muted hover:text-fg"
          aria-label={`Hapus ${label.toLowerCase()}`}
        >
          <X className="size-3" aria-hidden />
        </button>
      ) : (
        <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 md:flex">
          <Kbd>/</Kbd>
        </span>
      )}
    </div>
  );
}

export type FacetOption = {
  value: string;
  label: string;
  count?: number;
  tone?: Tone;
  disabled?: boolean;
};

/**
 * Multi-select facet.
 *
 * One component for every filter of this kind — statuses, categories, dusun,
 * letter types — because they all behave identically and differ only in the
 * options and their counts.
 */
export function FacetMenu({
  label,
  options,
  selected,
  onToggle,
  onClear,
  icon: Icon = Filter,
  emptyLabel = "Belum ada data",
  menuClassName,
  showZeroCounts = true,
}: {
  label: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear?: () => void;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  emptyLabel?: string;
  menuClassName?: string;
  showZeroCounts?: boolean;
}) {
  const visible = showZeroCounts ? options : options.filter((option) => (option.count ?? 0) > 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={`Saring berdasarkan ${label.toLowerCase()}`}>
          <Icon aria-hidden />
          {label}
          {selected.length > 0 ? (
            <Badge variant="civic" size="sm" className="tnum ml-0.5">
              {selected.length}
            </Badge>
          ) : null}
          <ChevronDown className="opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className={cn("min-w-[16rem]", menuClassName)} align="start">
        <DropdownMenuLabel>
          {label}
          {selected.length > 0 && onClear ? (
            <button
              type="button"
              className="text-2xs font-normal normal-case tracking-normal text-civic hover:underline"
              onClick={onClear}
            >
              Bersihkan
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {visible.length === 0 ? (
          <DropdownMenuItem disabled>{emptyLabel}</DropdownMenuItem>
        ) : (
          visible.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={selected.includes(option.value)}
              onCheckedChange={() => onToggle(option.value)}
              onSelect={(event) => event.preventDefault()}
              disabled={option.disabled}
            >
              {option.tone ? (
                <span
                  className={cn("size-1.5 shrink-0 rounded-full", TONE_CLASSES[option.tone].dot)}
                  aria-hidden
                />
              ) : null}
              <span className="flex-1 truncate">{option.label}</span>
              {option.count !== undefined ? (
                <span className="tnum ml-auto font-mono text-2xs text-fg-subtle">
                  {formatNumber(option.count)}
                </span>
              ) : null}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Single-choice sort control. */
export function SortMenu({
  value,
  options,
  onChange,
  label = "Urutkan",
}: {
  value: string;
  options: Record<string, string>;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`${label}: ${options[value] ?? value}`}>
          <ArrowUpDown aria-hidden />
          {options[value] ?? value}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {Object.entries(options).map(([key, text]) => (
          <DropdownMenuItem
            key={key}
            onSelect={() => onChange(key)}
            className={cn(value === key && "bg-civic-soft text-civic")}
          >
            {text}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Quick-filter chip — the one-click presets an officer uses at the counter. */
export function PresetChip({
  active,
  onClick,
  children,
  tone = "neutral",
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: Tone;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2 text-2xs font-medium transition-colors",
        active
          ? TONE_CLASSES[tone].chip
          : "border-line-strong bg-surface text-fg-muted hover:border-slate-400 hover:bg-surface-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic/45",
      )}
    >
      {children}
      {count !== undefined && count > 0 ? (
        <span className="tnum font-mono opacity-80">{formatNumber(count)}</span>
      ) : null}
    </button>
  );
}

export function ClearFiltersButton({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  if (count === 0) return null;
  return (
    <Button variant="ghost" size="xs" onClick={onClick} aria-label={`Bersihkan ${count} saringan`}>
      <X aria-hidden />
      Bersihkan ({count})
    </Button>
  );
}

export function ResultLabel({ children }: { children: React.ReactNode }) {
  return <span className="tnum text-2xs text-fg-subtle">{children}</span>;
}

/* -------------------------------------------------------------------------- */
/* Table                                                                       */
/* -------------------------------------------------------------------------- */

export const TH_CLASS =
  "sticky top-0 z-10 h-8 whitespace-nowrap border-b border-line bg-surface-muted px-3 text-left text-2xs font-semibold uppercase tracking-[0.045em] text-fg-subtle";

export const TD_CLASS = "px-3 align-middle";

export function TableFrame({
  children,
  caption,
  minWidthClass = "min-w-[1040px]",
  busy,
}: {
  children: React.ReactNode;
  caption: string;
  minWidthClass?: string;
  busy?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        className={cn("w-full border-collapse", minWidthClass)}
        aria-label={caption}
        aria-busy={busy}
      >
        {children}
      </table>
    </div>
  );
}

export function TableEmpty({
  colSpan,
  title,
  message,
}: {
  colSpan: number;
  title: string;
  message: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-14">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="grid size-10 place-items-center rounded-full border border-line bg-surface-muted">
            <Search className="size-4 text-fg-subtle" aria-hidden />
          </span>
          <p className="font-display text-[13px] font-semibold text-fg">{title}</p>
          <p className="max-w-sm text-2xs leading-4 text-fg-subtle">{message}</p>
        </div>
      </td>
    </tr>
  );
}

export function TableSkeleton({
  rows = 6,
  columns,
  label,
}: {
  rows?: number;
  columns: { key: string; width: string }[];
  label: string;
}) {
  return (
    <tbody aria-busy="true" aria-live="polite">
      <tr className="sr-only">
        <td colSpan={columns.length}>{label}</td>
      </tr>
      {Array.from({ length: rows }).map((_, index) => (
        <tr key={index} className="h-9 border-b border-line" aria-hidden>
          {columns.map((column) => (
            <td key={column.key} className="px-3">
              <Skeleton className={cn("h-3", column.width)} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

/**
 * Pagination footer.
 *
 * `onPageSize` is optional: the registry pages cap their page sizes to what the
 * API accepts (10/25/50/100), so the control can never produce a 422.
 */
export function Pager({
  page,
  pageSize,
  total,
  totalPages,
  onPage,
  onPageSize,
  noun,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
  noun: string;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-3.5 py-2">
      <div className="flex items-center gap-3">
        <p className="tnum text-2xs text-fg-muted">
          Menampilkan{" "}
          <span className="font-semibold text-fg">
            {formatNumber(first)}–{formatNumber(last)}
          </span>{" "}
          dari <span className="font-semibold text-fg">{formatNumber(total)}</span> {noun}
        </p>

        {onPageSize ? (
          <label className="flex items-center gap-1.5 text-2xs text-fg-subtle">
            <span className="sr-only">Jumlah baris per halaman</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSize(Number(event.target.value))}
              className="h-[22px] rounded-xs border border-line-strong bg-surface px-1 text-2xs text-fg-muted hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic/45"
              aria-label="Jumlah baris per halaman"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} baris
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <nav className="flex items-center gap-1" aria-label={`Navigasi halaman ${noun}`}>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => onPage(1)}
          aria-label="Halaman pertama"
        >
          <ChevronsLeft aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft aria-hidden />
        </Button>
        <span className="tnum px-2 text-2xs text-fg-muted">
          Halaman <span className="font-semibold text-fg">{page}</span> / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          aria-label="Halaman berikutnya"
        >
          <ChevronRight aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={page >= totalPages}
          onClick={() => onPage(totalPages)}
          aria-label="Halaman terakhir"
        >
          <ChevronsRight aria-hidden />
        </Button>
      </nav>
    </div>
  );
}

/** Footer strip used to explain the rule a table enforces. */
export function PanelFootnote({
  left,
  right,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-muted px-3.5 py-1.5">
      <p className="text-[10px] leading-4 text-fg-subtle">{left}</p>
      {right ? <span className="tnum shrink-0 text-[10px] text-fg-subtle">{right}</span> : null}
    </div>
  );
}
