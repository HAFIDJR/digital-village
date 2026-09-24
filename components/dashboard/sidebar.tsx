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
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, Kbd, Separator } from "@/components/ui/primitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { STAFF_ROLE, TONE_CLASSES } from "@/lib/domain";
import { formatClock, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActiveOfficer, VillageProfile } from "@/db/queries";
import { useAppDispatch, useAppSelector } from "@/store";
import { uiActions } from "@/store/ui-slice";

/**
 * Navigation rail.
 *
 * Every entry is a real route. The rail used to scroll to an anchor on a single
 * page; now the URL is the state, which means the browser's back button, a
 * bookmarked link and a shared link all agree with what the officer sees.
 *
 * The active entry is derived from `usePathname()` rather than from a click
 * handler: a deep link, a redirect or a back-navigation all light up the correct
 * menu item, and the rail can never disagree with the page it is sitting beside.
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
  reportsOpen: number;
  residents: number;
  families: number;
  announcements: number;
};

type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  count?: number;
  tone?: "neutral" | "pending" | "progress";
  /** Opens in a new tab — the public site lives outside the application. */
  external?: boolean;
};

type NavGroup = { id: string; label: string; items: NavItem[] };

function buildGroups(counts: NavCounts, website: string | null): NavGroup[] {
  const groups: NavGroup[] = [
    {
      id: "operasional",
      label: "Operasional",
      items: [
        {
          id: "dasbor",
          label: "Dasbor",
          href: "/",
          icon: LayoutDashboard,
          description: "Ringkasan dan daftar laporan warga",
          count: counts.reportsNew,
          tone: counts.reportsNew > 0 ? "pending" : "neutral",
        },
        {
          id: "antrean",
          label: "Antrean Pengajuan",
          href: "/antrean",
          icon: Inbox,
          description: "Daftar kerja surat warga dan KPI pelayanan",
          count: counts.queueTotal,
        },
        {
          id: "verifikasi",
          label: "Verifikasi Berkas",
          href: "/verifikasi",
          icon: ClipboardCheck,
          description: "Berkas yang menunggu pemeriksaan loket",
          count: counts.unprocessed,
          tone: "pending",
        },
        {
          id: "ttd",
          label: "Agenda TTD Kades",
          href: "/ttd",
          icon: Stamp,
          description: "Surat menunggu tanda tangan elektronik",
          count: counts.awaitingSignature,
          tone: "progress",
        },
        {
          id: "laporan",
          label: "Laporan Warga",
          href: "/laporan",
          icon: MessagesSquare,
          description: "Register lengkap laporan dan aspirasi",
          count: counts.reportsOpen,
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
          href: "/penduduk",
          icon: Users,
          description: "Registrasi penduduk dan status kependudukan",
          count: counts.residents,
        },
        {
          id: "keluarga",
          label: "Kartu Keluarga",
          href: "/keluarga",
          icon: IdCard,
          description: "Kepala keluarga dan anggota rumah tangga",
          count: counts.families,
        },
        {
          id: "wilayah",
          label: "Wilayah & Dusun",
          href: "/wilayah",
          icon: MapPin,
          description: "Pembagian dusun, RT, dan RW",
        },
      ],
    },
    {
      id: "publikasi",
      label: "Publikasi",
      items: [
        {
          id: "pengumuman",
          label: "Pengumuman Desa",
          href: "/pengumuman",
          icon: Megaphone,
          description: "Terbitkan dan jadwalkan pengumuman resmi",
          count: counts.announcements,
          tone: "progress",
        },
        {
          id: "situs",
          label: "Website Desa",
          href: "/situs",
          icon: ExternalLink,
          description: "Kanal publik dan verifikasi surat warga",
        },
      ],
    },
    {
      id: "sistem",
      label: "Sistem",
      items: [
        {
          id: "arsip",
          label: "Arsip Surat",
          href: "/arsip",
          icon: ScrollText,
          description: "Surat yang telah ditandatangani dan diarsipkan",
        },
        {
          id: "bantuan",
          label: "Bantuan",
          href: "/bantuan",
          icon: CircleHelp,
          description: "Panduan alur layanan dan pintasan papan tik",
        },
        {
          id: "pengaturan",
          label: "Pengaturan",
          href: "/pengaturan",
          icon: Settings,
          description: "Identitas desa, perangkat, dan katalog layanan",
        },
      ],
    },
  ];

  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.id === "situs" && website ? { ...item, href: website, external: true } : item,
    ),
  }));
}

/**
 * True when `href` is the route currently being viewed.
 *
 * `/` only matches exactly — every other path starts with `/`, so a prefix test
 * would light the dashboard up everywhere. Nested routes (`/penduduk/123`)
 * inherit their parent entry.
 */
function isActiveRoute(pathname: string, item: NavItem) {
  if (item.external) return false;
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
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
  const pathname = usePathname();
  const groups = React.useMemo(() => buildGroups(counts, village.website), [counts, village.website]);

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

      <NavList groups={groups} collapsed={collapsed} pathname={pathname} />

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
  const pathname = usePathname();
  const groups = React.useMemo(() => buildGroups(counts, village.website), [counts, village.website]);

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

  // A route change always dismisses the mobile drawer — otherwise the officer
  // lands on the new page with the menu covering it.
  React.useEffect(() => {
    close();
  }, [pathname, close]);

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

        <NavList groups={groups} collapsed={false} pathname={pathname} onNavigate={close} />

        <Separator />
        <OfficerCard officer={officer} serverTime={serverTime} collapsed={false} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

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

function NavList({
  groups,
  collapsed,
  pathname,
  onNavigate,
}: {
  groups: NavGroup[];
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Menu aplikasi desa" className="min-h-0 flex-1 overflow-y-auto px-2 py-2.5">
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
              const selected = isActiveRoute(pathname, item);

              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={selected ? "page" : undefined}
                  {...(item.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className={cn(
                    "relative flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic/45",
                    selected
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
                      {item.count !== undefined && item.count > 0 ? (
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
                </Link>
              );

              return (
                <li key={item.id}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block">{link}</span>
                      </TooltipTrigger>
                      <TooltipContent side="right">{item.description}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
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
          <span>Saring tabel</span>
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
