"use client";

import {
  Building2,
  CornerDownLeft,
  FileText,
  IdCard,
  LoaderCircle,
  Megaphone,
  Search,
  SearchX,
  Users,
  X,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/primitives";
import { formatNik, formatRelative } from "@/lib/format";
import { REQUEST_STATUS, REPORT_STATUS, TONE_CLASSES } from "@/lib/domain";
import { cn } from "@/lib/utils";
import type { SearchResults } from "@/db/queries";
import { errorMessage, useSearchQuery } from "@/store/api";
import { useAppDispatch, useAppSelector } from "@/store";
import { queueActions } from "@/store/queue-slice";
import { uiActions } from "@/store/ui-slice";
import { useNow } from "./now-context";

/**
 * Global instant search — "Cari data warga via NIK, Nama, atau No. KK".
 *
 * Implementation notes:
 *  - Debounced at 180 ms. Long enough that a 16-digit NIK typed at speed issues
 *    one request, short enough that the result feels instantaneous.
 *  - NIK digits are matched as a *prefix* server-side, so the officer can type
 *    the first six digits and already see candidate residents.
 *  - Full keyboard operation: type, ↑/↓, Enter to open. `/` opens the palette
 *    from anywhere in the app, Escape closes it.
 */

const DEBOUNCE_MS = 180;

type FlatRow =
  | { kind: "resident"; id: string; data: SearchResults["residents"][number] }
  | { kind: "request"; id: string; data: SearchResults["requests"][number] }
  | { kind: "report"; id: string; data: SearchResults["reports"][number] };

export function CommandPalette() {
  const dispatch = useAppDispatch();
  const open = useAppSelector((state) => state.ui.commandOpen);

  const [term, setTerm] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [cursor, setCursor] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback(() => {
    dispatch(uiActions.commandPaletteToggled(false));
    setTerm("");
    setDebounced("");
    setCursor(0);
  }, [dispatch]);

  // --- debounce -------------------------------------------------------------
  React.useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(term.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [term]);

  const { data, isFetching, isError, error } = useSearchQuery(
    { q: debounced, limit: 6 },
    { skip: debounced.length < 2 },
  );

  // --- flatten results for arrow-key navigation -----------------------------
  const rows = React.useMemo<FlatRow[]>(() => {
    if (!data) return [];
    return [
      ...data.residents.map((r) => ({ kind: "resident" as const, id: r.id, data: r })),
      ...data.requests.map((r) => ({ kind: "request" as const, id: r.id, data: r })),
      ...data.reports.map((r) => ({ kind: "report" as const, id: r.id, data: r })),
    ];
  }, [data]);

  React.useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  // --- keyboard -------------------------------------------------------------
  const activate = React.useCallback(
    (row: FlatRow) => {
      if (row.kind === "request") {
        dispatch(queueActions.requestSelected(row.id));
      } else if (row.kind === "resident") {
        // Filter the worklist to this resident; the officer then decides whether
        // to open a request or read the registry entry.
        dispatch(queueActions.searchChanged(row.data.fullName));
      } else {
        dispatch(queueActions.searchChanged(row.data.ticket));
      }
      close();
    },
    [close, dispatch],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (rows.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((index) => (index + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((index) => (index - 1 + rows.length) % rows.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[cursor];
      if (row) activate(row);
    }
  };

  // Scroll the highlighted row into view as the cursor moves.
  React.useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const hasResults = rows.length > 0;
  const showEmpty = debounced.length >= 2 && !isFetching && !hasResults && !isError;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[10vh]" role="presentation">
      <div
        className="absolute inset-0 bg-ink/40 animate-in fade-in-0"
        onClick={close}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="palette-label"
        className={cn(
          "relative flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-layer-3",
          "animate-in fade-in-0 zoom-in-95 slide-in-from-top-2",
        )}
      >
        <h2 id="palette-label" className="sr-only">
          Pencarian data warga dan berkas desa
        </h2>

        {/* --- query bar ---------------------------------------------------- */}
        <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-3">
          <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          <input
            ref={inputRef}
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              // A new query means a new result list; the highlight must not stay
              // on whatever row happened to be fourth in the previous one.
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Cari data warga via NIK, Nama, atau No. KK…"
            aria-label="Cari data warga via NIK, nama, atau nomor Kartu Keluarga"
            aria-describedby="palette-help"
            autoComplete="off"
            spellCheck={false}
            className="h-6 min-w-0 flex-1 border-0 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          {isFetching ? (
            <LoaderCircle className="size-3.5 shrink-0 animate-spin text-fg-subtle" aria-hidden />
          ) : null}
          {term ? (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setTerm("")}
              aria-label="Hapus kata kunci pencarian"
            >
              <X aria-hidden />
            </Button>
          ) : null}
          <Button variant="ghost" size="icon-xs" onClick={close} aria-label="Tutup pencarian">
            <X aria-hidden />
          </Button>
        </div>

        {/* --- results ------------------------------------------------------ */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto" role="listbox" aria-label="Hasil pencarian">
          {debounced.length < 2 ? (
            <PaletteHint />
          ) : isError ? (
            <p role="alert" className="px-3.5 py-6 text-center text-2xs text-rejected">
              {errorMessage(error)}
            </p>
          ) : showEmpty ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <SearchX className="size-4 text-fg-subtle" aria-hidden />
              <p className="text-xs font-medium text-fg">Tidak ada data yang cocok</p>
              <p className="max-w-xs text-2xs leading-4 text-fg-subtle">
                Pastikan NIK terdiri atas 16 digit, atau coba ketik sebagian nama warga tanpa gelar.
              </p>
            </div>
          ) : (
            <ResultGroups
              data={data}
              cursor={cursor}
              onActivate={activate}
              onHover={setCursor}
            />
          )}
        </div>

        {/* --- footer ------------------------------------------------------- */}
        <div
          id="palette-help"
          className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line bg-surface-muted px-3.5 py-2"
        >
          <Legend keys={["↑", "↓"]} label="Navigasi" />
          <Legend keys={["Enter"]} label="Buka" />
          <Legend keys={["Esc"]} label="Tutup" />
          <span className="ml-auto tnum text-[10px] text-fg-subtle">
            {data ? `${data.totalMatches} hasil ditemukan` : "Siap mencari"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ResultGroups({
  data,
  cursor,
  onActivate,
  onHover,
}: {
  data: SearchResults | undefined;
  cursor: number;
  onActivate: (row: FlatRow) => void;
  onHover: (index: number) => void;
}) {
  // Read before the early return so the hook order never depends on whether
  // results have arrived yet.
  const now = useNow();
  if (!data) return null;

  // Group offsets, computed up front: the keyboard cursor indexes into the
  // *concatenated* list, and accumulating that index while rendering would be a
  // mutation during render.
  const requestOffset = data.residents.length;
  const reportOffset = requestOffset + data.requests.length;

  return (
    <div className="py-1.5">
      {data.residents.length > 0 ? (
        <Group heading="Data Kependudukan" count={data.residents.length} icon={IdCard}>
          {data.residents.map((resident, position) => {
            const rowIndex = position;
            return (
              <ResultRow
                key={resident.id}
                rowIndex={rowIndex}
                active={cursor === rowIndex}
                onActivate={() => onActivate({ kind: "resident", id: resident.id, data: resident })}
                onHover={() => onHover(rowIndex)}
                icon={<IdCard className="size-3.5" aria-hidden />}
                title={resident.fullName}
                subtitle={`${formatNik(resident.nik)} · ${resident.dusun} RT ${String(resident.rt).padStart(2, "0")}/RW ${String(resident.rw).padStart(2, "0")}`}
                trailing={
                  <span className="flex items-center gap-1.5">
                    <span className="tnum text-[10px] text-fg-subtle">{resident.age} th</span>
                    <Badge
                      variant={resident.status === "AKTIF" ? "approved" : "neutral"}
                      size="sm"
                    >
                      {resident.status === "AKTIF" ? "Aktif" : resident.status.replace(/_/g, " ")}
                    </Badge>
                  </span>
                }
              />
            );
          })}
        </Group>
      ) : null}

      {data.requests.length > 0 ? (
        <Group heading="Pengajuan Surat" count={data.requests.length} icon={FileText}>
          {data.requests.map((request, position) => {
            const rowIndex = requestOffset + position;
            const statusMeta = REQUEST_STATUS[request.status as keyof typeof REQUEST_STATUS];
            return (
              <ResultRow
                key={request.id}
                rowIndex={rowIndex}
                active={cursor === rowIndex}
                onActivate={() => onActivate({ kind: "request", id: request.id, data: request })}
                onHover={() => onHover(rowIndex)}
                icon={<FileText className="size-3.5" aria-hidden />}
                title={request.applicantName}
                subtitle={`${request.ticket} · ${request.letterCode} · ${formatRelative(request.submittedAt, now)}`}
                trailing={
                  statusMeta ? (
                    <Badge
                      variant="outline"
                      size="sm"
                      className={TONE_CLASSES[statusMeta.tone].chip}
                    >
                      {statusMeta.short}
                    </Badge>
                  ) : null
                }
              />
            );
          })}
        </Group>
      ) : null}

      {data.reports.length > 0 ? (
        <Group heading="Laporan Warga" count={data.reports.length} icon={Megaphone}>
          {data.reports.map((report, position) => {
            const rowIndex = reportOffset + position;
            const statusMeta = REPORT_STATUS[report.status];
            return (
              <ResultRow
                key={report.id}
                rowIndex={rowIndex}
                active={cursor === rowIndex}
                onActivate={() => onActivate({ kind: "report", id: report.id, data: report })}
                onHover={() => onHover(rowIndex)}
                icon={<Megaphone className="size-3.5" aria-hidden />}
                title={report.subject}
                subtitle={report.ticket}
                trailing={
                  statusMeta ? (
                    <Badge variant="outline" size="sm" className={TONE_CLASSES[statusMeta.tone].chip}>
                      {statusMeta.label}
                    </Badge>
                  ) : null
                }
              />
            );
          })}
        </Group>
      ) : null}
    </div>
  );
}

function Group({
  heading,
  count,
  icon: Icon,
  children,
}: {
  heading: string;
  count: number;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <section className="py-1">
      <h3 className="flex items-center gap-1.5 px-3.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
        <Icon className="size-3" aria-hidden />
        {heading}
        <span className="tnum font-normal">({count})</span>
      </h3>
      <ul role="presentation">{children}</ul>
    </section>
  );
}

function ResultRow({
  rowIndex,
  active,
  onActivate,
  onHover,
  icon,
  title,
  subtitle,
  trailing,
}: {
  rowIndex: number;
  active: boolean;
  onActivate: () => void;
  onHover: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  trailing?: React.ReactNode;
}) {
  return (
    <li role="option" aria-selected={active} data-row-index={rowIndex}>
      <button
        type="button"
        onClick={onActivate}
        onMouseEnter={onHover}
        tabIndex={-1}
        className={cn(
          "flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors",
          active ? "bg-civic-soft" : "hover:bg-surface-muted",
        )}
      >
        <span
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-sm border",
            active ? "border-civic/30 bg-surface text-civic" : "border-line bg-surface-muted text-fg-subtle",
          )}
          aria-hidden
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-fg">{title}</span>
          <span className="tnum mt-0.5 block truncate font-mono text-[10px] text-fg-subtle">
            {subtitle}
          </span>
        </span>
        {trailing}
        {active ? (
          <CornerDownLeft className="size-3 shrink-0 text-civic" aria-hidden />
        ) : null}
      </button>
    </li>
  );
}

function PaletteHint() {
  return (
    <div className="px-3.5 py-5">
      <p className="text-xs font-medium text-fg">Pencarian menyeluruh data desa</p>
      <ul className="mt-2 space-y-1.5">
        {[
          { icon: IdCard, text: "NIK 16 digit — ketik sebagian saja, pencocokan dari depan." },
          { icon: Users, text: "Nama warga tanpa gelar, misalnya \"Siti Rahmawati\"." },
          { icon: Building2, text: "Nomor Kartu Keluarga untuk menelusuri satu keluarga." },
          { icon: FileText, text: "Nomor berkas pengajuan, misalnya SRT-1049." },
        ].map((item) => (
          <li key={item.text} className="flex items-start gap-2 text-2xs leading-4 text-fg-subtle">
            <item.icon className="mt-0.5 size-3 shrink-0" aria-hidden />
            {item.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Legend({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
      <span className="text-[10px] text-fg-subtle">{label}</span>
    </span>
  );
}
