import type { Metadata } from "next";

import { AnnouncementFeed } from "@/components/portal/announcement-feed";
import { requireResidentPage } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pengumuman Desa",
  description:
    "Pengumuman dan pemberitahuan resmi Pemerintah Desa Sukamaju untuk seluruh warga.",
  robots: { index: false, follow: false },
};

export default async function WargaPengumumanPage() {
  await requireResidentPage();

  return (
    <div className="space-y-4">
      <div>
        <p className="text-2xs font-medium uppercase tracking-wider text-fg-subtle">
          Portal Warga
        </p>
        <h1 className="font-display text-lg font-bold tracking-[-0.01em] text-fg">
          Pengumuman &amp; Notifikasi
        </h1>
        <p className="mt-0.5 text-xs leading-4 text-fg-muted">
          Setiap pengumuman yang diterbitkan perangkat desa muncul di sini secara
          otomatis, termasuk yang dijadwalkan terbit kemudian.
        </p>
      </div>

      <AnnouncementFeed />
    </div>
  );
}
