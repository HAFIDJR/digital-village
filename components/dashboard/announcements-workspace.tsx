"use client";

import { Eye, Megaphone, Radio, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/ui/primitives";
import {
  ANNOUNCEMENT_CHANNEL,
  ANNOUNCEMENT_STATUS,
  PRIORITY,
  TONE_CLASSES,
} from "@/lib/domain";
import { ROLE_CAPABILITIES } from "@/lib/domain";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage, useGetShellQuery, useListAnnouncementsQuery } from "@/store/api";
import type { StaffRole } from "@/db/schema";

import { AnnouncementComposer } from "./announcement-composer";
import { QueryErrorState } from "./feedback";
import { useNow } from "./now-context";
import {
  PageHeader,
  StatCard,
  StatStrip,
  TD_CLASS,
  TH_CLASS,
  TableEmpty,
  TableFrame,
  TableSkeleton,
} from "./page-kit";

/**
 * Pengumuman Desa.
 *
 * The full publication desk: the same quick-composer widget that sits on the
 * service workspace, plus the register of everything the village has published
 * — including scheduled notices, which are legitimately dated in the future.
 */
export function AnnouncementsWorkspace() {
  const now = useNow();
  const announcements = useListAnnouncementsQuery();
  const shell = useGetShellQuery();

  const rows = announcements.data?.announcements ?? [];
  const published = rows.filter((row) => row.status === "TERBIT");
  const scheduled = rows.filter((row) => row.status === "TERJADWAL");
  const drafts = rows.filter((row) => row.status === "DRAF");

  const canPublish = shell.data?.officer
    ? (ROLE_CAPABILITIES[shell.data.officer.role as StaffRole]?.publish ?? false)
    : false;

  if (announcements.isError) {
    return (
      <>
        <PageHeader eyebrow="Publikasi" icon={Megaphone} title="Pengumuman Desa" />
        <QueryErrorState
          title="Gagal memuat pengumuman desa"
          message={errorMessage(announcements.error)}
          onRetry={() => announcements.refetch()}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Publikasi · Kanal Informasi Desa"
        icon={Megaphone}
        title="Pengumuman Desa"
        description="Terbitkan pemberitahuan resmi ke website desa, papan informasi balai, dan grup WhatsApp warga. Jadwal terbit dan kanal tercatat pada jejak audit."
        meta={
          <span className="tnum text-2xs text-fg-subtle">
            {formatNumber(published.length)} terbit · {formatNumber(scheduled.length)} terjadwal
          </span>
        }
      />

      <StatStrip>
        <StatCard
          label="Terbit"
          value={formatNumber(published.length)}
          unit="pengumuman"
          hint="Tayang di website desa dan papan informasi"
          tone="approved"
          icon={Radio}
        />
        <StatCard
          label="Terjadwal"
          value={formatNumber(scheduled.length)}
          unit="pengumuman"
          hint="Akan terbit otomatis sesuai waktu yang ditetapkan"
          tone="pending"
          icon={Send}
        />
        <StatCard
          label="Draf"
          value={formatNumber(drafts.length)}
          unit="pengumuman"
          hint="Belum diterbitkan ke kanal mana pun"
          icon={Megaphone}
        />
        <StatCard
          label="Total dibaca"
          value={formatNumber(rows.reduce((sum, row) => sum + row.viewCount, 0))}
          unit="kali"
          hint="Akumulasi tampilan pada kanal publik desa"
          tone="progress"
          icon={Eye}
        />
      </StatStrip>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)]">
        <Panel className="min-w-0">
          <PanelHeader
            title="Register Pengumuman"
            description="Seluruh pengumuman yang tercatat di sistem desa, terbaru lebih dulu."
            icon={Megaphone}
            action={
              <Badge variant="outline" size="sm">
                {formatNumber(rows.length)} pengumuman
              </Badge>
            }
          />
          <TableFrame
            caption="Register pengumuman desa"
            minWidthClass="min-w-[900px]"
            busy={announcements.isLoading}
          >
            <thead>
              <tr>
                <th scope="col" className={cn(TH_CLASS, "w-[300px]")}>Judul</th>
                <th scope="col" className={cn(TH_CLASS, "w-[170px]")}>Kanal</th>
                <th scope="col" className={cn(TH_CLASS, "w-[150px]")}>Status</th>
                <th scope="col" className={cn(TH_CLASS, "w-[150px]")}>Penulis</th>
                <th scope="col" className={cn(TH_CLASS, "w-[170px]")}>Jadwal terbit</th>
                <th scope="col" className={cn(TH_CLASS, "w-[100px]")}>Dibaca</th>
              </tr>
            </thead>

            {announcements.isLoading ? (
              <TableSkeleton
                columns={[
                  { key: "a", width: "w-48" },
                  { key: "b", width: "w-24" },
                  { key: "c", width: "w-20" },
                  { key: "d", width: "w-24" },
                  { key: "e", width: "w-24" },
                  { key: "f", width: "w-8" },
                ]}
                label="Memuat pengumuman desa…"
              />
            ) : rows.length === 0 ? (
              <tbody>
                <TableEmpty
                  colSpan={6}
                  title="Belum ada pengumuman"
                  message="Gunakan widget di samping untuk menerbitkan pengumuman pertama desa."
                />
              </tbody>
            ) : (
              <tbody>
                {rows.map((row) => {
                  const statusMeta = ANNOUNCEMENT_STATUS[row.status] ?? {
                    label: row.status,
                    tone: "neutral" as const,
                  };
                  const priority = PRIORITY[row.priority];
                  return (
                    <tr key={row.id} className="h-9 border-b border-line transition-colors hover:bg-surface-muted">
                      <td className={TD_CLASS}>
                        <div className="flex min-w-0 flex-col justify-center gap-0.5 leading-4">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium text-fg" title={row.title}>
                              {row.title}
                            </span>
                            {row.pinned ? (
                              <Badge variant="civic" size="sm">
                                Disematkan
                              </Badge>
                            ) : null}
                            {row.priority !== "NORMAL" && priority ? (
                              <Badge
                                variant={row.priority === "DARURAT" ? "rejected" : "pending"}
                                size="sm"
                              >
                                {priority.label}
                              </Badge>
                            ) : null}
                          </span>
                          <span className="truncate text-[10px] text-fg-subtle" title={row.excerpt ?? ""}>
                            {row.excerpt ?? row.slug}
                          </span>
                        </div>
                      </td>
                      <td className={TD_CLASS}>
                        <span className="truncate text-xs text-fg-muted">
                          {ANNOUNCEMENT_CHANNEL[row.channel]?.label ?? row.channel}
                        </span>
                      </td>
                      <td className={TD_CLASS}>
                        <Badge
                          variant="outline"
                          size="sm"
                          className={cn(TONE_CLASSES[statusMeta.tone].chip)}
                        >
                          {statusMeta.label}
                        </Badge>
                      </td>
                      <td className={TD_CLASS}>
                        <span className="truncate text-xs text-fg-muted">
                          {row.authorName?.replace(/,.*$/, "") ?? "Sistem"}
                        </span>
                      </td>
                      <td className={TD_CLASS}>
                        <div className="flex flex-col justify-center gap-0.5 leading-4">
                          <span className="tnum text-xs text-fg">
                            {row.publishAt ? formatDateTime(row.publishAt) : "Belum dijadwalkan"}
                          </span>
                          <span className="tnum text-[10px] text-fg-subtle">
                            {row.publishAt ? formatRelative(row.publishAt, now) : "—"}
                          </span>
                        </div>
                      </td>
                      <td className={TD_CLASS}>
                        <span className="tnum text-xs text-fg-muted">
                          {formatNumber(row.viewCount)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </TableFrame>
        </Panel>

        <Panel className="min-h-[26rem] min-w-0">
          <PanelHeader
            title="Widget Cepat Pengumuman Desa"
            description="Tulis, tentukan kanal dan jadwal, lalu terbitkan."
            icon={Send}
            action={
              <span className="hidden rounded-xs border border-progress-line/60 bg-progress-bg px-1.5 py-0.5 text-[10px] font-medium text-progress sm:inline">
                Kanal: Website Desa
              </span>
            }
          />
          <AnnouncementComposer
            announcements={rows.slice(0, 4)}
            loading={announcements.isLoading}
            canPublish={canPublish}
          />
        </Panel>
      </div>
    </>
  );
}
