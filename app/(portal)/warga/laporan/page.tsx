import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  ReportPanel,
  type PortalNeighborhoodOption,
} from "@/components/portal/report-panel";
import { getResidentPortalData, getVillageProfile, listAreas } from "@/db/queries";
import { requireResidentPage } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Laporan & Aspirasi",
  description:
    "Sampaikan laporan dan aspirasi Anda, lalu pantau tindak lanjut perangkat Desa Sukamaju.",
  robots: { index: false, follow: false },
};

export default async function WargaLaporanPage() {
  const actor = await requireResidentPage();

  const village = await getVillageProfile();
  if (!village) redirect("/warga");

  const [profile, areas] = await Promise.all([
    getResidentPortalData(actor.resident.id),
    listAreas(village.id),
  ]);
  if (!profile) redirect("/warga/masuk");

  const neighborhoods: PortalNeighborhoodOption[] = areas.neighborhoods.map(
    (neighborhood) => ({
      id: neighborhood.id,
      label: `${neighborhood.hamlet.split(" - ")[0]} · RT ${String(neighborhood.rt).padStart(2, "0")}/RW ${String(neighborhood.rw).padStart(2, "0")}`,
    }),
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">
          Portal Warga
        </p>
        <h1 className="font-display text-lg font-bold tracking-[-0.01em] text-fg">
          Laporan &amp; Aspirasi
        </h1>
        <p className="mt-0.5 text-xs leading-4 text-fg-muted">
          Keluhan dan usulan Anda dicatat sebagai laporan resmi desa dan
          ditindaklanjuti oleh perangkat yang berwenang.
        </p>
      </div>

      <ReportPanel
        neighborhoods={neighborhoods}
        defaultNeighborhoodId={profile.resident.neighborhoodId}
      />
    </div>
  );
}
