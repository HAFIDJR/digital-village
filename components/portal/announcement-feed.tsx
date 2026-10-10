"use client";

import {
  Bell,
  BellOff,
  CheckCheck,
  LoaderCircle,
  Megaphone,
  Pin,
  RefreshCw,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ANNOUNCEMENT_CHANNEL,
  NOTIFICATION_SEVERITY,
  PRIORITY,
  TONE_CLASSES,
} from "@/lib/domain";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  errorMessage,
  useListResidentAnnouncementsQuery,
  useMarkResidentAnnouncementsReadMutation,
} from "@/store/api";

/**
 * Pengumuman desa as the resident sees it: derived from what the officer
 * published, so drafts and archived items never appear here. Read state lives
 * per resident, which is what drives the unread badge in the portal menu.
 */
export function AnnouncementFeed() {
  const feed = useListResidentAnnouncementsQuery();
  const [markRead, markReadState] = useMarkResidentAnnouncementsReadMutation();
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const rows = feed.data?.announcements ?? [];
  const unread = feed.data?.unread ?? 0;

  return (
    <section
      aria-labelledby="pengumuman-desa"
      className="rounded-lg border border-line bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div>
          <h2 id="pengumuman-desa" className="text-xs font-semibold text-fg">
            Pengumuman &amp; Notifikasi
          </h2>
          <p className="mt-0.5 text-2xs text-fg-subtle">
            {rows.length} pengumuman terbit
            {unread > 0 ? ` · ${unread} belum dibaca` : " · semuanya sudah dibaca"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => feed.refetch()}
            disabled={feed.isFetching}
            aria-label="Segarkan pengumuman"
          >
            <RefreshCw className={cn(feed.isFetching && "animate-spin")} aria-hidden />
            Segarkan
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => markRead()}
            disabled={unread === 0 || markReadState.isLoading}
          >
            {markReadState.isLoading ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <CheckCheck aria-hidden />
            )}
            Tandai sudah dibaca
          </Button>
        </div>
      </div>

      {feed.isError ? (
        <p role="alert" className="px-4 py-4 text-2xs text-rejected">
          {errorMessage(feed.error)}
        </p>
      ) : null}

      {markReadState.isError ? (
        <p role="alert" className="border-b border-line px-4 py-2 text-2xs text-rejected">
          {errorMessage(markReadState.error)}
        </p>
      ) : null}

      {feed.isLoading ? (
        <ul className="divide-y divide-line" aria-busy="true">
          {Array.from({ length: 3 }).map((_, index) => (
            <li key={index} className="px-4 py-3">
              <div className="h-3 w-52 rounded-sm bg-surface-muted" />
              <div className="mt-2 h-2.5 w-full rounded-sm bg-surface-muted" />
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <span className="grid size-9 place-items-center rounded-md border border-line bg-surface-muted">
            <BellOff className="size-4 text-fg-subtle" aria-hidden />
          </span>
          <p className="text-xs font-medium text-fg">Belum ada pengumuman</p>
          <p className="max-w-sm text-2xs leading-4 text-fg-subtle">
            Pengumuman yang diterbitkan perangkat desa akan tampil di halaman
            ini secara otomatis.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((item) => {
            const severity = NOTIFICATION_SEVERITY[item.severity] ?? {
              label: item.severity,
              tone: "neutral" as const,
            };
            const priority = PRIORITY[item.priority];
            const isOpen = expanded === item.id;

            return (
              <li
                key={item.id}
                id={`pengumuman-${item.slug}`}
                className={cn("px-4 py-3", item.readAt === null && "bg-civic-soft/40")}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-fg">
                      {item.readAt === null ? (
                        <Bell className="size-3 shrink-0 text-civic" aria-label="Belum dibaca" />
                      ) : null}
                      {item.title}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-fg-subtle">
                      <span className="tnum">
                        {formatDateTime(item.publishAt ?? item.createdAt)}
                      </span>
                      {item.authorName ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>{item.authorName}</span>
                        </>
                      ) : null}
                      <span aria-hidden>·</span>
                      <span>
                        Sasaran: {item.audience} ·{" "}
                        {ANNOUNCEMENT_CHANNEL[item.channel]?.label ?? item.channel}
                      </span>
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    {item.pinned ? (
                      <Badge variant="civic" size="sm">
                        <Pin aria-hidden />
                        Tersemat
                      </Badge>
                    ) : null}
                    {priority && priority.label !== "Normal" ? (
                      <Badge
                        variant="outline"
                        size="sm"
                        className={cn(TONE_CLASSES[priority.tone].chip)}
                      >
                        {priority.label}
                      </Badge>
                    ) : null}
                    <Badge
                      variant="outline"
                      size="sm"
                      className={cn(TONE_CLASSES[severity.tone].chip)}
                    >
                      <Megaphone aria-hidden />
                      {severity.label}
                    </Badge>
                  </div>
                </div>

                {isOpen ? (
                  <p className="mt-2 max-w-2xl text-2xs leading-5 whitespace-pre-line text-fg-muted">
                    {item.body}
                  </p>
                ) : (
                  <p className="mt-1 line-clamp-2 max-w-2xl text-2xs leading-4 text-fg-muted">
                    {item.excerpt ?? item.body}
                  </p>
                )}

                <div className="mt-1.5 flex items-center gap-2">
                  <Button
                    variant="link"
                    size="xs"
                    onClick={() => setExpanded(isOpen ? null : item.id)}
                    aria-expanded={isOpen}
                    aria-controls={`isi-pengumuman-${item.slug}`}
                  >
                    {isOpen ? "Tutup" : "Baca selengkapnya"}
                  </Button>
                  {item.readAt === null ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={markReadState.isLoading}
                      onClick={() => markRead({ ids: [item.id] })}
                    >
                      <CheckCheck aria-hidden />
                      Tandai dibaca
                    </Button>
                  ) : null}
                </div>

                {isOpen ? (
                  <span id={`isi-pengumuman-${item.slug}`} className="sr-only">
                    Isi pengumuman ditampilkan di atas.
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
