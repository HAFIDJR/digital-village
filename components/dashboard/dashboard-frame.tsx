"use client";

import * as React from "react";

import { Kbd } from "@/components/ui/primitives";
import { formatNumber } from "@/lib/format";
import { errorMessage, useGetShellQuery } from "@/store/api";
import { useAppDispatch } from "@/store";
import { queueActions } from "@/store/queue-slice";
import { uiActions } from "@/store/ui-slice";
import type { VillageProfile } from "@/db/queries";

import { CommandPalette } from "./command-palette";
import { QueryErrorState, ToastHost } from "./feedback";
import { NowProvider } from "./now-context";
import { ReviewDrawer } from "./review-drawer";
import { Sidebar, SidebarDrawer, type NavCounts } from "./sidebar";
import { Topbar } from "./topbar";

/**
 * The persistent shell every route renders inside.
 *
 * Splitting the chrome out of the dashboard body was the point of this
 * refactor: `/antrean`, `/penduduk` and `/laporan` are different pages with
 * different data, but the officer should never see the header, the rail or the
 * notification bell remount — losing scroll position or the open drawer on
 * navigation is exactly the kind of friction an eight-hour shift cannot absorb.
 *
 * The shell fetches only `/api/shell` (identity, shift, bell, badge counts).
 * Page bodies fetch their own data through their own RTK Query endpoints, so
 * opening the registry does not pull the letter queue over the wire.
 */

const fallbackVillage: VillageProfile = {
  id: "",
  name: "Desa Sukamaju",
  district: "Kecamatan Cimaung",
  regency: "Kabupaten Bandung",
  province: "Jawa Barat",
  villageCode: "32.04.16.2007",
  headName: "—",
  headNipd: null,
  officeAddress: "—",
  officePhone: "—",
  officeEmail: "—",
  website: null,
  sealUrl: "/seal-desa-sukamaju.svg",
  establishedYear: null,
};

export function DashboardFrame({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const { data, isLoading, isError, error, refetch, fulfilledTimeStamp } = useGetShellQuery();

  /* ------------------------------------------------------- global shortcuts */
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      // "/" opens the global citizen search from anywhere that is not a field.
      if (event.key === "/" && !typing) {
        event.preventDefault();
        dispatch(uiActions.commandPaletteToggled(true));
        return;
      }
      if (event.key === "Escape") {
        dispatch(uiActions.commandPaletteToggled(false));
        dispatch(queueActions.requestSelected(null));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch]);

  /* ---------------------------------------------------------------- clock */
  const clock = data ? Date.parse(data.serverTime) : Number.NaN;
  const initialNow = Number.isNaN(clock) ? (fulfilledTimeStamp ?? 0) : clock;
  const now = React.useMemo(() => initialNow, [initialNow]);

  if (isError || (!isLoading && !data)) {
    return (
      <NowProvider initial={now}>
        <div className="min-h-screen">
          <Topbar
            village={fallbackVillage}
            officer={null}
            notifications={[]}
            unread={0}
            serverTime={now}
          />
          <div className="mx-auto w-full max-w-[1520px] p-4">
            <QueryErrorState
              title="Gagal memuat data desa"
              message={errorMessage(error)}
              onRetry={() => refetch()}
            />
          </div>
        </div>
      </NowProvider>
    );
  }

  const counts: NavCounts = {
    queueTotal: data?.counts.queueTotal ?? 0,
    unprocessed: data?.counts.unprocessed ?? 0,
    awaitingSignature: data?.counts.awaitingSignature ?? 0,
    reportsNew: data?.counts.reportsNew ?? 0,
    reportsOpen: data?.counts.reportsOpen ?? 0,
    residents: data?.counts.residents ?? 0,
    families: data?.counts.families ?? 0,
    announcements: data?.counts.announcementsPublished ?? 0,
  };

  const unread = (data?.notifications ?? []).filter((n) => n.readAt === null).length;
  const serverTime = fulfilledTimeStamp ?? now;

  return (
    <NowProvider initial={now}>
      <a
        href="#konten-utama"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-sm focus:border focus:border-line focus:bg-surface focus:px-3 focus:py-1.5 focus:text-xs focus:font-medium"
      >
        Lompat ke konten utama
      </a>

      <div className="min-h-screen">
        <Topbar
          village={data?.village ?? fallbackVillage}
          officer={data?.officer ?? null}
          notifications={data?.notifications ?? []}
          unread={unread}
          serverTime={serverTime}
          onMenuClick={() => dispatch(uiActions.navToggled(true))}
        />

        <div className="mx-auto flex w-full max-w-[1800px] items-start">
          <Sidebar
            village={data?.village ?? fallbackVillage}
            officer={data?.officer ?? null}
            counts={counts}
            serverTime={serverTime}
          />

          <main id="konten-utama" className="min-w-0 flex-1 space-y-3.5 px-3 py-4 sm:px-4">
            {children}

            <footer className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2 pt-1">
              <p className="text-[10px] leading-4 text-fg-subtle">
                {data?.village.name} · {data?.village.officeAddress}
              </p>
              <p className="text-[10px] leading-4 text-fg-subtle">
                Data kependudukan tersinkronisasi dengan Disdukcapil{" "}
                {data?.village.regency ?? ""}. Perubahan status surat tercatat otomatis pada jejak
                audit desa.
              </p>
            </footer>
          </main>
        </div>

        <SidebarDrawer
          village={data?.village ?? fallbackVillage}
          officer={data?.officer ?? null}
          counts={counts}
          serverTime={serverTime}
        />

        {/* Overlays live in the shell: the review drawer has to survive a
            navigation between /antrean, /verifikasi and /ttd. */}
        <ReviewDrawer />
        <CommandPalette />
        <ToastHost />

        <p aria-live="polite" className="sr-only">
          {data
            ? `Mode operator ${data.officer?.fullName ?? "tidak diketahui"}. ${formatNumber(
                counts.queueTotal,
              )} pengajuan surat dan ${formatNumber(counts.reportsOpen)} laporan warga perlu ditangani.`
            : ""}
        </p>

        {isLoading ? (
          <p className="sr-only" role="status">
            Memuat data desa…
          </p>
        ) : null}

        <p className="sr-only">
          Pintasan: <Kbd>/</Kbd> untuk pencarian warga, <Kbd>Esc</Kbd> untuk menutup panel.
        </p>
      </div>
    </NowProvider>
  );
}
