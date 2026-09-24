"use client";

import {
  ChevronLeft,
  CircleHelp,
  ClipboardCheck,
  ExternalLink,
  Inbox,
  IdCard,
  LayoutDashboard,
  MapPin,
  Megaphone,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  Stamp,
  Users,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, Kbd, Separator } from "@/components/ui/primitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STAFF_ROLE, TONE_CLASSES } from "@/lib/domain";
import { formatClock, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActiveOfficer, VillageProfile } from "@/db/queries";
import type { RequestStatus } from "@/db/schema";
import { useAppDispatch, useAppSelector } from "@/store";
import { queueActions } from "@/store/queue-slice";
import { uiActions } from "@/store/ui-slice";

/**
 * Navigation rail.
 *
 * Every entry resolves to something that actually exists on this screen: anchors
 * jump to a section, and the queue entries apply a real status filter, so the
 * sidebar is a second, coarser way into the worklist rather than decoration.
 *
 * Below `lg` the rail becomes an off-canvas drawer opened from the header —
 * office laptops are the target, but an officer borrowing a tablet at the front
 * desk still has to be able to move around.
 */

export type NavCounts = {
  queueTotal: number;
  unprocessed: number;
  awaitingSignature: number;
  reportsNew: number;
  residents: number;
  families: number;
};

type NavItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Section to scroll to, when the item maps onto this page. */
  target?: string;
  /** Queue filter applied together with the jump. */
  statuses?: RequestStatus[];
  /** Opens the global search palette — the registry lives there. */
  search?: boolean;
  count?: number;
  tone?: "neutral" | "pending" | "progress";
  /** Present but not part of this prototype. */
  reserved?: boolean;
  href?: string;
};

type NavGroup = { id: string; label: string; items: NavItem[] };

function buildGroups(counts: NavCounts, website: string | null): NavGroup[] {
  return [
    {
      id: "operasional",
      label: "Operasional",
      items: [
        { id: "dasbor", label: "Dasbor", icon: LayoutDashboard, target: "dasbor" },
        {
          id: "antrean",
          label: "Antrean Pengajuan",
          icon: Inbox,
          target: "antrean",
          statuses: [],
          count: counts.queueTotal,
        },
        {
          id: "verifikasi",
          label: "Verifikasi Berkas",
          icon: ClipboardCheck,
          target: "antrean",
          statuses: ["PENDING_VERIFIKASI", "BERKAS_TIDAK_LENGKAP"],
          count: counts.unprocessed,
          tone: "pending",
        },
        {
          id: "ttd",
          label: "Agenda TTD Kades",
          icon: Stamp,
          target: "antrean",
          statuses: ["MENUNGGU_TTD_KADES"],
          count: counts.awaitingSignature,
          tone: "progress",
        },
        {
          id: "laporan",
          label: "Laporan Warga",
          icon: MessagesSquare,
          target: "laporan",
          count: counts.reportsNew,
          tone: "pending",
        },
      ],
    },
    {
      id: "data",
      label: "Data Desa",
      items: [
        {
          id: "penduduk",
          label: "Data Penduduk",
          icon: Users,
          search: true,
          count: counts.residents,
        },
        { id: "keluarga", label: "Kartu Keluarga", icon: IdCard, search: true, count: counts.families },
        { id: "wilayah", label: "Wilayah & Dusun", icon: MapPin, target: "antrean" },
      ],
    },
    {
      id: "publikasi",
      label: "Publikasi",
      items: [
        { id: "pengumuman", label: "Pengumuman Desa", icon: Megaphone, target: "pengumuman" },
        {
          id: "situs",
          label: "Website Desa",
          icon: ExternalLink,
          href: website ?? "#",
        },
      ],
    },
    {
      id: "sistem",
      label: "Sistem",
      items: [
        { id: "arsip", label: "Arsip Surat", icon: ScrollText, target: "aktivitas" },
        { id: "bantuan", label: "Bantuan", icon: CircleHelp, reserved: true },
        { id: "pengaturan", label: "Pengaturan", icon: Settings, reserved: true },
      ],
    },
  ];
}

const SECTION_IDS = ["dasbor", "kependudukan", "antrean", "aktivitas", "pengumuman", "laporan"] as const;

/**
 * Highlights the entry whose section currently owns the viewport. Root margins
 * account for the sticky header and the fact that the last section is short.
 */
function useActiveSection() {
  const [active, setActive] = React.useState<string>("dasbor");

  React.useEffect(() => {
    const elements = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-88px 0px -55% 0px", threshold: [0, 1] },
    );

    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return active;
}

/* -------------------------------------------------------------------------- */

export function Sidebar({
  village,
  officer,
  counts,
  serverTime,
}: {
  village: VillageProfile;
  officer: ActiveOfficer | null;
  counts: NavCounts;
  serverTime: number;
}) {
  const collapsed = useAppSelector((state) => state.ui.navCollapsed);
  const dispatch = useAppDispatch();
  useAutoCollapseRail();
  const active = useActiveSection();
  const groups = React.useMemo(() => buildGroups(counts, village.website), [counts, village.website]);

  const navigate = useNavigate(active);

  return (
    <aside
      aria-label="Navigasi utama"
      className={cn(
        "sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col border-r border-line bg-surface lg:flex",
        collapsed ? "w-[4.5rem]" : "w-[16.5rem]",
        "transition-[width] duration-150",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        {!collapsed ? (
          <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
            Menu Petugas
          </p>
        ) : (
          <span className="sr-only">Menu Petugas</span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn("shrink-0", collapsed && "mx-auto")}
              onClick={() => dispatch(uiActions.navCollapsedToggled())}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Perlebar menu navigasi" : "Persempit menu navigasi"}
            >
              {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? "Perlebar menu" : "Persempit menu ke ikon"}
          </TooltipContent>
        </Tooltip>
      </div>

      <Separator />

      <NavList groups={groups} collapsed={collapsed} onNavigate={navigate} />

      <Separator />

      <OfficerCard officer={officer} serverTime={serverTime} collapsed={collapsed} />

      {!collapsed ? <ShortcutHints /> : null}
    </aside>
  );
}

/* -------------------------------------------------------------------------- */

export function SidebarDrawer({
  village,
  officer,
  counts,
  serverTime,
}: {
  village: VillageProfile;
  officer: ActiveOfficer | null;
  counts: NavCounts;
  serverTime: number;
}) {
  const open = useAppSelector((state) => state.ui.navOpen);
  const dispatch = useAppDispatch();
  const active = useActiveSection();
  const groups = React.useMemo(() => buildGroups(counts, village.website), [counts, village.website]);
  const navigate = useNavigate(active);

  const close = React.useCallback(() => dispatch(uiActions.navToggled(false)), [dispatch]);

  // Escape closes the drawer; the palette keeps its own handler.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="absolute inset-0 bg-ink/45"
        onClick={close}
        role="presentation"
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigasi utama"
        className="absolute inset-y-0 left-0 flex w-[17rem] max-w-[86vw] flex-col border-r border-line bg-surface shadow-layer-3"
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-line px-3">
          <p className="text-xs font-semibold text-fg">Menu Petugas</p>
          <Button variant="ghost" size="icon-xs" onClick={close} aria-label="Tutup menu navigasi">
            <ChevronLeft aria-hidden />
          </Button>
        </div>

        <NavList
          groups={groups}
          collapsed={false}
          onNavigate={(item) => {
            navigate(item);
            close();
          }}
        />

        <Separator />
        <OfficerCard officer={officer} serverTime={serverTime} collapsed={false} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Applies an item's side effects: queue presets, palette, anchors, links. */
function useNavigate(activeSection: string) {
  const dispatch = useAppDispatch();

  return React.useCallback(
    (item: NavItem) => {
      if (item.href) {
        window.open(item.href, "_blank", "noopener,noreferrer");
        return;
      }
      if (item.statuses) {
        // Replaces the whole status filter with the rail's preset, so the table
        // and the highlighted menu entry can never disagree.
        dispatch(queueActions.statusesReplaced(item.statuses));
        dispatch(queueActions.pageChanged(1));
      }
      if (item.search) {
        dispatch(uiActions.commandPaletteToggled(true));
        return;
      }
      if (item.target) scrollToSection(item.target, item.target === activeSection);
    },
    [dispatch, activeSection],
  );
}

/**
 * Starts on the icon rail below 1440px.
 *
 * The worklist needs ~1162px of its own; an expanded 264px rail would leave a
 * 1366×768 office laptop scrolling sideways through the primary table. Officers
 * who prefer the labels can expand it, and that choice is never overridden.
 */
function useAutoCollapseRail() {
  const dispatch = useAppDispatch();
  const applied = React.useRef(false);

  React.useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    if (window.innerWidth < 1440) dispatch(uiActions.navCollapsedToggled());
  }, [dispatch]);
}

function scrollToSection(id: string, alreadyActive: boolean) {
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView({ behavior: alreadyActive ? "auto" : "smooth", block: "start" });
}

function NavList({
  groups,
  collapsed,
  onNavigate,
}: {
  groups: NavGroup[];
  collapsed: boolean;
  onNavigate: (item: NavItem) => void;
}) {
  const queue = useAppSelector((state) => state.queue);

  return (
    <nav aria-label="Bagian dashboard" className="min-h-0 flex-1 overflow-y-auto px-2 py-2.5">
      {groups.map((group) => (
        <div key={group.id} className="mb-3 last:mb-0">
          {collapsed ? (
            <span aria-hidden className="mx-2 mb-1.5 block h-px bg-line" />
          ) : (
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
              {group.label}
            </p>
          )}

          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const selected =
                (item.target === "antrean" || item.id === "antrean") &&
                matchesQueuePreset(item, queue.statuses);

              const button = (
                <button
                  type="button"
                  onClick={() => onNavigate(item)}
                  aria-current={selected ? "true" : undefined}
                  aria-disabled={item.reserved || undefined}
                  className={cn(
                    "relative flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic/45",
                    item.reserved
                      ? "cursor-not-allowed text-fg-subtle/70"
                      : selected
                        ? "bg-civic-soft font-medium text-civic"
                        : "text-fg-muted hover:bg-surface-muted hover:text-fg",
                    collapsed && "justify-center px-0",
                  )}
                >
                  {selected ? (
                    <span
                      aria-hidden
                      className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-civic"
                    />
                  ) : null}
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  {!collapsed ? (
                    <>
                      <span className="min-w-0 flex-1 truncate text-xs">{item.label}</span>
                      {item.count !== undefined ? (
                        <span
                          className={cn(
                            "tnum shrink-0 rounded-xs px-1 py-px font-mono text-[10px] font-semibold",
                            item.tone === "pending"
                              ? "bg-pending-bg text-pending"
                              : item.tone === "progress"
                                ? "bg-progress-bg text-progress"
                                : "bg-surface-muted text-fg-subtle",
                          )}
                        >
                          {formatNumber(item.count)}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </button>
              );

              return (
                <li key={item.id}>
                  {collapsed || item.reserved ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block">{button}</span>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {item.reserved
                          ? `${item.label} — modul terpisah, belum termasuk prototipe ini`
                          : item.label}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    button
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** True when the rail entry's preset is the filter currently in force. */
function matchesQueuePreset(item: NavItem, activeStatuses: RequestStatus[]) {
  if (item.reserved || item.search) return false;
  if (item.id === "antrean") return activeStatuses.length === 0;
  if (!item.statuses?.length) return false;
  return (
    activeStatuses.length === item.statuses.length &&
    item.statuses.every((status) => activeStatuses.includes(status))
  );
}

function OfficerCard({
  officer,
  serverTime,
  collapsed,
}: {
  officer: ActiveOfficer | null;
  serverTime: number;
  collapsed: boolean;
}) {
  if (!officer) return null;

  if (collapsed) {
    return (
      <div className="flex items-center justify-center py-3">
        <Avatar initials={officer.initials} className="size-7" />
      </div>
    );
  }

  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-2.5">
        <Avatar initials={officer.initials} className="size-8" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-fg">{officer.fullName}</p>
          <p className="truncate text-[10px] text-fg-subtle">
            {STAFF_ROLE[officer.role as keyof typeof STAFF_ROLE] ?? officer.jobTitle}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <Badge variant="approved" size="sm">
          <span className={cn("size-1.5 rounded-full", TONE_CLASSES.approved.dot)} aria-hidden />
          Shift Aktif
        </Badge>
        {officer.shiftStartedAt ? (
          <span className="tnum font-mono text-[10px] text-fg-subtle">
            {formatClock(new Date(officer.shiftStartedAt))}–{formatClock(new Date(serverTime))}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ShortcutHints() {
  return (
    <div className="border-t border-line bg-surface-muted px-3 py-2.5">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-fg-subtle">
        Pintasan
      </p>
      <ul className="space-y-1 text-[10px] text-fg-subtle">
        <li className="flex items-center justify-between gap-2">
          <span>Cari data warga</span>
          <Kbd>/</Kbd>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span>Saring tabel antrean</span>
          <Kbd>f</Kbd>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span>Tutup panel</span>
          <Kbd>Esc</Kbd>
        </li>
      </ul>
    </div>
  );
}

export { SECTION_IDS };
