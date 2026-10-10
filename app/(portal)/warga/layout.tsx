import type { ReactNode } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { VillageSeal } from "@/components/dashboard/village-seal";
import { ensureDatabaseReady } from "@/db/bootstrap";
import { getVillageProfile } from "@/db/queries";
import { requireResidentPage } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  await ensureDatabaseReady();
  const actor = await requireResidentPage();
  const village = await getVillageProfile();

  const initials = actor.resident.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-3 px-4">
          <VillageSeal
            name={village?.name ?? "Desa Sukamaju"}
            regency={village?.regency ?? "Kabupaten Bandung"}
            sealUrl={village?.sealUrl ?? null}
          />
          <div className="flex items-center gap-2.5">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="max-w-44 truncate text-2xs font-semibold text-fg">
                {actor.resident.fullName}
              </p>
              <p className="tnum text-[10px] font-mono text-fg-subtle">
                NIK …{actor.resident.nik.slice(-4)}
              </p>
            </div>
            <span
              aria-hidden
              className="grid size-6 shrink-0 place-items-center rounded-full border border-civic/25 bg-civic-soft text-[10px] font-bold text-civic"
            >
              {initials || "W"}
            </span>
            <LogoutButton label="Keluar" variant="outline" size="sm" />
          </div>
        </div>
      </header>

      <main id="konten-utama" className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        {children}
      </main>

      <footer className="border-t border-line bg-surface">
        <p className="mx-auto w-full max-w-4xl px-4 py-3 text-[10px] leading-4 text-fg-subtle">
          {village
            ? `${village.name} · ${village.officeAddress} · ${village.officePhone}`
            : "Pemerintah Desa Sukamaju"}
          <br />
          Keaslian setiap surat dapat diperiksa publik melalui kode QR tercetak.
        </p>
      </footer>
    </div>
  );
}