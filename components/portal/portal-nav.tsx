"use client";

import { FileText, Megaphone, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { useListResidentAnnouncementsQuery } from "@/store/api";

const ITEMS = [
  { href: "/warga", label: "Layanan Surat", icon: FileText },
  { href: "/warga/laporan", label: "Laporan & Aspirasi", icon: MessagesSquare },
  { href: "/warga/pengumuman", label: "Pengumuman", icon: Megaphone },
] as const;

/**
 * Portal menu. The unread dot on "Pengumuman" comes from the same RTK query the
 * feed uses, so a broadcast published while the resident is browsing lights up
 * without a reload.
 */
export function PortalNav() {
  const pathname = usePathname();
  const announcements = useListResidentAnnouncementsQuery();
  const unread = announcements.data?.unread ?? 0;

  return (
    <nav
      aria-label="Menu portal warga"
      className="sticky top-14 z-30 border-b border-line bg-surface"
    >
      <ul className="mx-auto flex w-full max-w-4xl gap-1 overflow-x-auto px-4">
        {ITEMS.map((item) => {
          const active =
            item.href === "/warga"
              ? pathname === "/warga"
              : pathname.startsWith(item.href);
          const badge = item.href === "/warga/pengumuman" ? unread : 0;
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-xs font-medium whitespace-nowrap transition-colors",
                  active
                    ? "border-civic text-civic"
                    : "border-transparent text-fg-muted hover:text-fg",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {item.label}
                {badge > 0 ? (
                  <span
                    className="tnum ml-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-civic px-1 text-[10px] font-bold text-white"
                    title={`${badge} pengumuman belum dibaca`}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
