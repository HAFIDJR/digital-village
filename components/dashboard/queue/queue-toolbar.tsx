"use client";

import {
  ArrowUpDown,
  ChevronDown,
  Filter,
  ListFilter,
  Rows3,
  Search,
  X,
} from "lucide-react";

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
import { Input, Kbd } from "@/components/ui/primitives";
import { REQUEST_STATUS, type Tone } from "@/lib/domain";
import { TONE_CLASSES } from "@/lib/domain";
import { PAGE_SIZES } from "@/lib/validators";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type { RequestStatus } from "@/db/schema";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  activeFilterCount,
  hasActiveFilters,
  queueActions,
  type QueueSort,
} from "@/store/queue-slice";
import type { QueuePage } from "@/db/queries";

const SORT_LABELS: Record<QueueSort, string> = {
  submitted_desc: "Terbaru diajukan",
  submitted_asc: "Terlama diajukan",
  sla_asc: "Paling mendesak (SLA)",
  priority_desc: "Prioritas tertinggi",
};

const STATUS_ORDER: RequestStatus[] = [
  "PENDING_VERIFIKASI",
  "BERKAS_TIDAK_LENGKAP",
  "DIVERIFIKASI",
  "MENUNGGU_TTD_KADES",
  "DITANDATANGANI",
  "SIAP_DIAMBIL",
  "SELESAI",
  "DITOLAK",
];

const STATUS_TONE_DOT: Record<RequestStatus, string> = {
  PENDING_VERIFIKASI: TONE_CLASSES.pending.dot,
  BERKAS_TIDAK_LENGKAP: TONE_CLASSES.rejected.dot,
  DIVERIFIKASI: TONE_CLASSES.progress.dot,
  MENUNGGU_TTD_KADES: TONE_CLASSES.pending.dot,
  DITANDATANGANI: TONE_CLASSES.approved.dot,
  SIAP_DIAMBIL: TONE_CLASSES.approved.dot,
  SELESAI: TONE_CLASSES.approved.dot,
  DITOLAK: TONE_CLASSES.rejected.dot,
};

/**
 * Toolbar above the queue.
 *
 * Every control is local UI state wired to the `queue` slice; RTK Query keys off
 * that state, so no control here issues a request directly. That keeps "what is
 * the officer looking at" in exactly one place.
 */
export function QueueToolbar({
  data,
  resultLabel,
  searchInputRef,
}: {
  data?: QueuePage;
  resultLabel: string;
  searchInputRef?: React.Ref<HTMLInputElement>;
}) {
  const dispatch = useAppDispatch();
  const queue = useAppSelector((state) => state.queue);
  const filterCount = useAppSelector((state) => activeFilterCount(state.queue));
  const filtered = useAppSelector((state) => hasActiveFilters(state.queue));

  const statusCounts = data?.statusCounts ?? {};
  const letterTypes = data?.letterTypeCounts ?? [];
  const dusunOptions = data?.dusunCounts ?? [];

  return (
    <div className="flex flex-col gap-2 border-b border-line bg-surface px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* --- local table search (distinct from global NIK search) --------- */}
        <div className="relative min-w-[15rem] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle"
            aria-hidden
          />
          <Input
            ref={searchInputRef}
            type="search"
            value={queue.search}
            onChange={(event) => dispatch(queueActions.searchChanged(event.target.value))}
            placeholder="Saring antrean ini berdasarkan nama, nomor berkas, atau NIK…"
            aria-label="Saring antrean pengajuan"
            className="pl-8 pr-16"
          />
          {queue.search ? (
            <button
              type="button"
              onClick={() => dispatch(queueActions.searchChanged(""))}
              className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-xs text-fg-subtle hover:bg-surface-muted hover:text-fg"
              aria-label="Hapus kata kunci saringan"
            >
              <X className="size-3" aria-hidden />
            </button>
          ) : (
            <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 md:flex">
              <Kbd>/</Kbd>
            </span>
          )}
        </div>

        {/* --- status ------------------------------------------------------- */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" aria-label="Saring berdasarkan status">
              <Filter aria-hidden />
              Status
              {queue.statuses.length > 0 ? (
                <Badge variant="civic" size="sm" className="ml-0.5 tnum">
                  {queue.statuses.length}
                </Badge>
              ) : null}
              <ChevronDown className="opacity-60" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-[16rem]" align="start">
            <DropdownMenuLabel>
              Status pengajuan
              {queue.statuses.length > 0 ? (
                <button
                  type="button"
                  className="text-2xs font-normal normal-case tracking-normal text-civic hover:underline"
                  onClick={() => dispatch(queueActions.statusesReplaced([]))}
                >
                  Bersihkan
                </button>
              ) : null}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STATUS_ORDER.map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={queue.statuses.includes(status)}
                onCheckedChange={() => dispatch(queueActions.statusToggled(status))}
                onSelect={(event) => event.preventDefault()}
              >
                <span
                  className={cn("size-1.5 shrink-0 rounded-full", STATUS_TONE_DOT[status])}
                  aria-hidden
                />
                <span className="flex-1">{REQUEST_STATUS[status].label}</span>
                <span className="tnum ml-auto font-mono text-2xs text-fg-subtle">
                  {formatNumber(statusCounts[status] ?? 0)}
                </span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* --- letter type -------------------------------------------------- */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" aria-label="Saring berdasarkan jenis surat">
              <ListFilter aria-hidden />
              Jenis Surat
              {queue.letterTypes.length > 0 ? (
                <Badge variant="civic" size="sm" className="ml-0.5 tnum">
                  {queue.letterTypes.length}
                </Badge>
              ) : null}
              <ChevronDown className="opacity-60" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-80 min-w-[17rem] overflow-y-auto" align="start">
            <DropdownMenuLabel>Jenis layanan surat</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {letterTypes.length === 0 ? (
              <DropdownMenuItem disabled>Belum ada data</DropdownMenuItem>
            ) : (
              letterTypes.map((type) => (
                <DropdownMenuCheckboxItem
                  key={type.code}
                  checked={queue.letterTypes.includes(type.code)}
                  onCheckedChange={() => dispatch(queueActions.letterTypeToggled(type.code))}
                  onSelect={(event) => event.preventDefault()}
                >
                  <span className="flex-1 truncate">{type.name}</span>
                  <span className="tnum ml-auto font-mono text-2xs text-fg-subtle">
                    {formatNumber(type.count)}
                  </span>
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* --- dusun -------------------------------------------------------- */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" aria-label="Saring berdasarkan dusun">
              Dusun
              {queue.dusun.length > 0 ? (
                <Badge variant="civic" size="sm" className="ml-0.5 tnum">
                  {queue.dusun.length}
                </Badge>
              ) : null}
              <ChevronDown className="opacity-60" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-[15rem]" align="start">
            <DropdownMenuLabel>Wilayah dusun</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {dusunOptions.map((dusun) => (
              <DropdownMenuCheckboxItem
                key={dusun.code}
                checked={queue.dusun.includes(dusun.code)}
                onCheckedChange={() => dispatch(queueActions.dusunToggled(dusun.code))}
                onSelect={(event) => event.preventDefault()}
              >
                <span className="flex-1">{dusun.name}</span>
                <span className="tnum ml-auto font-mono text-2xs text-fg-subtle">
                  {formatNumber(dusun.count)}
                </span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="mx-0.5 h-5 w-px bg-line" aria-hidden />

        {/* --- sort --------------------------------------------------------- */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="Ubah urutan tabel">
              <ArrowUpDown aria-hidden />
              {SORT_LABELS[queue.sort]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Urutkan berdasarkan</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(Object.keys(SORT_LABELS) as QueueSort[]).map((sort) => (
              <DropdownMenuItem
                key={sort}
                onSelect={() => dispatch(queueActions.sortChanged(sort))}
                className={cn(queue.sort === sort && "bg-civic-soft text-civic")}
              >
                {SORT_LABELS[sort]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* --- density ------------------------------------------------------ */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dispatch(queueActions.densityToggled())}
          aria-pressed={queue.density === "compact"}
          aria-label={`Kepadatan tabel: ${queue.density === "compact" ? "rapat" : "nyaman"}. Klik untuk mengubah.`}
          title="Ubah kepadatan baris"
        >
          <Rows3 aria-hidden />
          {queue.density === "compact" ? "Rapat" : "Nyaman"}
        </Button>

        <span className="ml-auto flex items-center gap-2">
          <span className="tnum text-2xs text-fg-subtle">{resultLabel}</span>
          {filtered ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => dispatch(queueActions.filtersCleared())}
              aria-label={`Bersihkan ${filterCount} saringan`}
            >
              <X aria-hidden />
              Bersihkan {filterCount > 0 ? `(${filterCount})` : ""}
            </Button>
          ) : null}
        </span>
      </div>

      {/* --- SLA quick presets, shown only when they are actionable -------- */}
      <SlaPresets overdueCount={data?.overdueTotal ?? 0} />
    </div>
  );
}

/**
 * SLA presets.
 *
 * Deliberately rendered as inline text buttons rather than another dropdown:
 * "which of my open files are late?" is the single most common question at the
 * counter, and it should be one click away, not two.
 */
function SlaPresets({ overdueCount }: { overdueCount: number }) {
  const dispatch = useAppDispatch();
  const { sla, statuses } = useAppSelector((state) => state.queue);

  const isOverdue = sla === "overdue";
  const isUnprocessed =
    statuses.length === 2 &&
    statuses.includes("PENDING_VERIFIKASI") &&
    statuses.includes("BERKAS_TIDAK_LENGKAP");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">
        Tampilan cepat
      </span>

      <PresetChip
        active={isUnprocessed}
        onClick={() => dispatch(queueActions.focusUnprocessed())}
        tone="pending"
      >
        Belum diproses
      </PresetChip>

      <PresetChip
        active={isOverdue}
        onClick={() =>
          isOverdue ? dispatch(queueActions.slaChanged("all")) : dispatch(queueActions.showOnlyOverdue())
        }
        tone="rejected"
        count={overdueCount}
      >
        Lewat batas SLA
      </PresetChip>

      <PresetChip
        active={statuses.length === 1 && statuses[0] === "MENUNGGU_TTD_KADES"}
        onClick={() => {
          dispatch(queueActions.filtersCleared());
          dispatch(queueActions.statusesReplaced(["MENUNGGU_TTD_KADES"]));
        }}
        tone="pending"
      >
        Tunggu TTD Kades
      </PresetChip>

      <PresetChip
        active={statuses.length === 1 && statuses[0] === "SIAP_DIAMBIL"}
        onClick={() => {
          dispatch(queueActions.filtersCleared());
          dispatch(queueActions.statusesReplaced(["SIAP_DIAMBIL"]));
        }}
        tone="approved"
      >
        Siap diambil
      </PresetChip>
    </div>
  );
}

function PresetChip({
  active,
  onClick,
  children,
  tone,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone: Tone;
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

/** Pagination footer, kept in this module so the toolbar owns the whole header. */
export function QueuePagination({
  page,
  pageSize,
  totalPages,
  total,
}: {
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
}) {
  const dispatch = useAppDispatch();

  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const pageWindow = buildPageWindow(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-3.5 py-2">
      <div className="flex items-center gap-3">
        <p className="tnum text-2xs text-fg-muted">
          Menampilkan{" "}
          <span className="font-semibold text-fg">
            {formatNumber(first)}–{formatNumber(last)}
          </span>{" "}
          dari <span className="font-semibold text-fg">{formatNumber(total)}</span> pengajuan
        </p>

        <label className="flex items-center gap-1.5 text-2xs text-fg-subtle">
          <span className="sr-only">Jumlah baris per halaman</span>
          <select
            value={pageSize}
            onChange={(event) => dispatch(queueActions.pageSizeChanged(Number(event.target.value)))}
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
      </div>

      <nav className="flex items-center gap-1" aria-label="Navigasi halaman antrean">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => dispatch(queueActions.pageChanged(1))}
          aria-label="Halaman pertama"
        >
          <span aria-hidden className="text-2xs font-semibold">
            «
          </span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => dispatch(queueActions.pageChanged(page - 1))}
          aria-label="Halaman sebelumnya"
        >
          <span aria-hidden className="text-2xs font-semibold">
            ‹
          </span>
        </Button>

        {pageWindow.map((entry, index) =>
          entry === "gap" ? (
            <span key={`gap-${index}`} className="px-1 text-2xs text-fg-subtle" aria-hidden>
              …
            </span>
          ) : (
            <Button
              key={entry}
              variant={entry === page ? "primary" : "ghost"}
              size="icon-sm"
              onClick={() => dispatch(queueActions.pageChanged(entry))}
              aria-label={`Halaman ${entry}`}
              aria-current={entry === page ? "page" : undefined}
              className="tnum text-2xs"
            >
              {entry}
            </Button>
          ),
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          disabled={page >= totalPages}
          onClick={() => dispatch(queueActions.pageChanged(page + 1))}
          aria-label="Halaman berikutnya"
        >
          <span aria-hidden className="text-2xs font-semibold">
            ›
          </span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={page >= totalPages}
          onClick={() => dispatch(queueActions.pageChanged(totalPages))}
          aria-label="Halaman terakhir"
        >
          <span aria-hidden className="text-2xs font-semibold">
            »
          </span>
        </Button>
      </nav>
    </div>
  );
}

/** 1 … 4 5 [6] 7 8 … 24 — never more than seven slots. */
function buildPageWindow(page: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, totalPages, page]);
  for (let offset = 1; offset <= 2; offset += 1) {
    if (page - offset > 1) pages.add(page - offset);
    if (page + offset < totalPages) pages.add(page + offset);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const output: (number | "gap")[] = [];
  let previous = 0;

  for (const current of sorted) {
    if (previous && current - previous > 1) output.push("gap");
    output.push(current);
    previous = current;
  }
  return output;
}
