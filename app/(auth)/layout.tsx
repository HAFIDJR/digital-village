import type { ReactNode } from "react";

import { ensureDatabaseReady } from "@/db/bootstrap";
import { getVillageProfile } from "@/db/queries";
import { VillageSeal } from "@/components/dashboard/village-seal";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  await ensureDatabaseReady();
  const village = await getVillageProfile();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <VillageSeal
          name={village?.name ?? "Desa Sukamaju"}
          regency={village?.regency ?? "Kabupaten Bandung"}
          sealUrl={village?.sealUrl ?? null}
        />
        <p className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">
          Sistem Informasi Pelayanan Desa
        </p>
      </div>

      {children}

      <p className="max-w-sm text-center text-[10px] leading-4 text-fg-subtle">
        {village
          ? `${village.name} · ${village.district}, ${village.regency} · ${village.officePhone}`
          : "Pemerintah Desa Sukamaju"}
        <br />
        Halaman ini terhubung ke server desa. Kata sandi tidak pernah disimpan dalam
        bentuk terbuka.
      </p>
    </div>
  );
}