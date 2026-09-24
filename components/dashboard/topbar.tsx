"use client";

import {
  Bell,
  CalendarDays,
  CheckCheck,
  CircleAlert,
  Dot,
  Info,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  TriangleAlert,
  UserCog,
  Wifi,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, Kbd } from "@/components/ui/primitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NOTIFICATION_SEVERITY, STAFF_ROLE, TONE_CLASSES } from "@/lib/domain";
import { formatClock, formatLongDate, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActiveOfficer, NotificationEntry, VillageProfile } from "@/db/queries";
import { useMarkNotificationsReadMutation } from "@/store/api";
import { useAppDispatch } from "@/store";
import { uiActions } from "@/store/ui-slice";
import { useNow } from "./now-context";
import { VillageSeal } from "./village-seal";

/**
 * Operational header.
 *
 * Left: village identity, so a printout or a screenshot is always attributable.
 * Centre: the global instant-search trigger, which is a *button* that opens the
 * palette rather than a live input — one hotkey, one focus target, no competing
 * text fields in the chrome.
 * Right: who is signed in, which shift they are on, and what needs attention.
 */
export function Topbar({
  village,
  officer,
  notifications,
  unread,
  serverTime,
  onMenuClick,
}: {
  village: VillageProfile;
  officer: ActiveOfficer | null;
  notifications: NotificationEntry[];
  unread: number;
  serverTime: number;
  onMenuClick?: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="mx-auto flex h-14 w-full max-w-[1520px] items-center gap-3 px-4">
        {/* --------------------------------------------------- nav (mobile) */}
        {onMenuClick ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={onMenuClick}
            aria-label="Buka menu navigasi"
          >
            <Menu aria-hidden />
          </Button>
        ) : null}

        {/* ------------------------------------------------------- identity */}
        <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <VillageSeal name={village.name} regency={village.regency} sealUrl={village.sealUrl} />
          <span aria-hidden className="hidden h-7 w-px bg-line lg:block" />
          <div className="hidden min-w-0 lg:block">
            <p className="flex items-center gap-1.5 truncate text-2xs font-medium text-fg-muted">
              <ShieldCheck className="size-3 shrink-0 text-approved" aria-hidden />
              Sistem Informasi Pelayanan Desa
            </p>
            <p className="truncate text-[10px] text-fg-subtle">
              Kode Wilayah {village.villageCode} · Berdiri {village.establishedYear ?? "—"}
            </p>
          </div>
        </div>

        {/* --------------------------------------------------------- search */}
        <SearchTrigger />

        {/* --------------------------------------------------------- right */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <WorkingDate serverTime={serverTime} />
          <ShiftIndicator officer={officer} serverTime={serverTime} />
          <NotificationBell notifications={notifications} unread={unread} />
          <OfficerMenu officer={officer} village={village} />
        </div>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */

function SearchTrigger() {
  const dispatch = useAppDispatch();
  const open = () => dispatch(uiActions.commandPaletteToggled(true));

  // Phones get a plain icon: the full trigger's placeholder and hotkey hint
  // cannot fit beside the officer's details without scrolling the header.
  return (
    <div className="flex min-w-0 flex-1 justify-center">
      <Button
        variant="ghost"
        size="icon-sm"
        className="sm:hidden"
        onClick={open}
        aria-label="Buka pencarian data warga"
      >
        <Search aria-hidden />
      </Button>
      <button
        type="button"
        onClick={open}
        aria-label="Buka pencarian data warga. Pintasan tombol garis miring."
        className={cn(
          "group hidden h-9 w-full max-w-[38rem] items-center gap-2.5 rounded-md border border-line-strong bg-surface-muted px-3 sm:flex",
          "text-left transition-colors hover:border-slate-400 hover:bg-surface",
          "focus-visible:outline-none focus-visible:border-civic focus-visible:ring-2 focus-visible:ring-civic/22",
        )}
      >
        <Search className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-xs text-fg-subtle">
          Cari data warga via NIK, Nama, atau No. KK…
        </span>
        <span className="hidden shrink-0 items-center gap-1 sm:flex">
          <Kbd>Press</Kbd>
          <Kbd>/</Kbd>
          <span className="text-[10px] text-fg-subtle">to search</span>
        </span>
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function WorkingDate({ serverTime }: { serverTime: number }) {
  const date = new Date(serverTime);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="hidden items-center gap-1.5 rounded-sm border border-line bg-surface-muted px-2 py-1 xl:flex"
          tabIndex={0}
        >
          <CalendarDays className="size-3.5 text-fg-subtle" aria-hidden />
          <span className="text-2xs font-medium text-fg-muted">{formatLongDate(date)}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Hari kerja pelayanan desa. Jam server: {formatClock(date)} WIB.
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Active shift indicator.
 *
 * Answers "am I clocked in, and for how long?" — the practical question behind
 * the brief's "active shift indicator". Duration is derived from the shift row
 * rather than kept in component state, so a tab left open overnight tells the
 * truth on its next render.
 */
function ShiftIndicator({
  officer,
  serverTime,
}: {
  officer: ActiveOfficer | null;
  serverTime: number;
}) {
  const [elapsed, setElapsed] = React.useState(() =>
    officer?.shiftStartedAt ? serverTime - new Date(officer.shiftStartedAt).getTime() : 0,
  );

  React.useEffect(() => {
    if (!officer?.shiftStartedAt) return;
    const startedAt = new Date(officer.shiftStartedAt).getTime();
    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    // The readout is in minutes; 30 s keeps it visibly live without a busy loop.
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [officer?.shiftStartedAt]);

  if (!officer?.shiftStartedAt) {
    return (
      <Badge variant="neutral" size="md" className="gap-1.5">
        <Dot className="size-4 animate-pulse text-slate-400" aria-hidden />
        Belum Absen
      </Badge>
    );
  }

  const hours = Math.floor(elapsed / 3_600_000);
  const minutes = Math.floor((elapsed % 3_600_000) / 60_000);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="flex items-center gap-2 rounded-sm border border-approved-line/60 bg-approved-bg px-2 py-1"
          tabIndex={0}
          aria-label={`Shift aktif sejak ${formatClock(officer.shiftStartedAt)} WIB, berjalan ${hours} jam ${minutes} menit`}
        >
          <span className="relative flex size-2" aria-hidden>
            <span className="absolute inline-flex size-2 rounded-full bg-approved-solid pulse-ring text-approved-solid" />
          </span>
          <span className="text-2xs font-semibold text-approved">Shift Aktif</span>
          <span className="tnum font-mono text-2xs text-approved/85">
            {formatClock(officer.shiftStartedAt)} · {hours}j {String(minutes).padStart(2, "0")}m
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {officer.shiftStation ?? "Loket Pelayanan"} · {officer.fullName} ({officer.jobTitle}).
        Absen masuk tercatat pada buku agenda digital desa.
      </TooltipContent>
    </Tooltip>
  );
}

/* -------------------------------------------------------------------------- */

const SEVERITY_ICON = {
  INFO: Info,
  SUCCESS: ShieldCheck,
  WARNING: TriangleAlert,
  CRITICAL: CircleAlert,
} as const;

function NotificationBell({
  notifications,
  unread,
}: {
  notifications: NotificationEntry[];
  unread: number;
}) {
  const now = useNow();
  const dispatch = useAppDispatch();
  const [markRead, markReadState] = useMarkNotificationsReadMutation();

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label={
                unread > 0
                  ? `${unread} notifikasi belum dibaca`
                  : "Notifikasi sistem, tidak ada yang baru"
              }
            >
              <Bell aria-hidden />
              {unread > 0 ? (
                <span
                  className={cn(
                    "tnum absolute -right-0.5 -top-0.5 grid min-w-[15px] place-items-center rounded-full",
                    "border border-surface bg-rejected-solid px-1 text-[9px] font-bold leading-[13px] text-white",
                  )}
                  aria-hidden
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Notifikasi &amp; pengingat operasional</TooltipContent>
      </Tooltip>

      <DropdownMenuContent className="w-[22rem] p-0" align="end">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <div>
            <p className="text-xs font-semibold text-fg">Notifikasi</p>
            <p className="tnum text-[10px] text-fg-subtle">
              {unread > 0 ? `${unread} belum dibaca` : "Semua sudah dibaca"}
            </p>
          </div>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              disabled={markReadState.isLoading}
              onClick={() => markRead()}
              aria-label="Tandai semua notifikasi sebagai sudah dibaca"
            >
              <CheckCheck aria-hidden />
              Tandai dibaca
            </Button>
          ) : null}
        </div>

        <ul className="max-h-[22rem] overflow-y-auto">
          {notifications.length === 0 ? (
            <li className="px-3 py-6 text-center text-2xs text-fg-subtle">
              Tidak ada notifikasi pada shift ini.
            </li>
          ) : (
            notifications.map((item) => {
              const meta = NOTIFICATION_SEVERITY[item.severity] ?? NOTIFICATION_SEVERITY.INFO;
              const Icon = SEVERITY_ICON[item.severity as keyof typeof SEVERITY_ICON] ?? Info;
              const unreadItem = item.readAt === null;

              return (
                <li key={item.id} className="border-b border-line last:border-0">
                  <DropdownMenuItem
                    asChild
                    className={cn("items-start rounded-none px-3 py-2.5", unreadItem && "bg-civic-soft/40")}
                  >
                    <a
                      href={item.href ?? "#"}
                      onClick={(event) => {
                        if (!item.href) event.preventDefault();
                        else dispatch(uiActions.notificationsToggled(false));
                      }}
                      className="flex items-start gap-2.5"
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-sm border",
                          TONE_CLASSES[meta.tone].chip,
                        )}
                        aria-hidden
                      >
                        <Icon className="size-3" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-1.5">
                          <span
                            className={cn(
                              "min-w-0 flex-1 text-xs leading-4",
                              unreadItem ? "font-semibold text-fg" : "font-medium text-fg-muted",
                            )}
                          >
                            {item.title}
                          </span>
                          {unreadItem ? (
                            <span
                              className="mt-1 size-1.5 shrink-0 rounded-full bg-civic"
                              aria-label="Belum dibaca"
                            />
                          ) : null}
                        </span>
                        {item.body ? (
                          <span className="mt-0.5 block text-[10px] leading-4 text-fg-subtle">
                            {item.body}
                          </span>
                        ) : null}
                        <span className="tnum mt-0.5 block text-[10px] text-fg-subtle">
                          {formatRelative(item.createdAt, now)}
                        </span>
                      </span>
                    </a>
                  </DropdownMenuItem>
                </li>
              );
            })
          )}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* -------------------------------------------------------------------------- */

function OfficerMenu({
  officer,
  village,
}: {
  officer: ActiveOfficer | null;
  village: VillageProfile;
}) {
  const dispatch = useAppDispatch();

  if (!officer) {
    return (
      <Badge variant="pending" size="md" className="gap-1.5">
        <CircleAlert className="size-3.5" aria-hidden />
        Tidak ada petugas aktif
      </Badge>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 items-center gap-2 rounded-md border border-line bg-surface pl-1.5 pr-2",
            "transition-colors hover:border-slate-400 hover:bg-surface-muted",
            "focus-visible:outline-none focus-visible:border-civic focus-visible:ring-2 focus-visible:ring-civic/22",
          )}
          aria-label={`Akun petugas: ${officer.fullName}, ${officer.jobTitle}`}
        >
          <Avatar initials={officer.initials} tone="civic" className="size-6 text-[10px]" />
          <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
            <span className="max-w-[11rem] truncate text-2xs font-semibold text-fg">
              {officer.fullName.replace(/,.*$/, "")}
            </span>
            <span className="max-w-[11rem] truncate text-[10px] text-fg-subtle">
              {officer.jobTitle}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[17rem]">
        <DropdownMenuLabel>Perangkat Desa Bertugas</DropdownMenuLabel>
        <div className="px-2 pb-2">
          <p className="text-xs font-semibold text-fg">{officer.fullName}</p>
          <p className="text-[10px] text-fg-subtle">
            {STAFF_ROLE[officer.role as keyof typeof STAFF_ROLE] ?? officer.jobTitle}
            {officer.nipd ? ` · NIPD ${officer.nipd}` : ""}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-fg-subtle">
            <Wifi className="size-3" aria-hidden />
            {officer.email}
          </p>
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => dispatch(uiActions.commandPaletteToggled(true))}>
          <Search aria-hidden />
          Cari Data Warga
          <DropdownMenuShortcut>/</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <UserCog aria-hidden />
          Profil &amp; Hak Akses
        </DropdownMenuItem>
        <DropdownMenuItem disabled>
          <Settings aria-hidden />
          Pengaturan Desa
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <p className="text-[10px] leading-4 text-fg-subtle">
            {village.name} · {village.district}
            <br />
            {village.officePhone} · {village.officeEmail}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem tone="danger" disabled>
          <LogOut aria-hidden />
          Akhiri Shift &amp; Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
