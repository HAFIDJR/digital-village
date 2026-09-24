import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

// Self-hosted variable fonts (Fontsource). The dashboard must render
// identically on an air-gapped office workstation, so nothing is fetched from a
// font CDN at runtime.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./globals.css";

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "Dashboard Operator & Perangkat Desa — Desa Sukamaju",
    template: "%s · Desa Sukamaju",
  },
  description:
    "Sistem informasi pelayanan administrasi Desa Sukamaju, Kecamatan Cimaung, Kabupaten Bandung. Antrean pengajuan surat, data kependudukan, dan pengumuman desa.",
  applicationName: "Digital Village",
  authors: [{ name: "Pemerintah Desa Sukamaju" }],
  icons: { icon: "/favicon.ico" },
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The dashboard is used on desktop monitors; allow zoom for accessibility.
  maximumScale: 5,
  themeColor: "#0F172A",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className="h-full">
      <body className="min-h-full bg-canvas font-sans text-fg antialiased">
        {/* First tab stop: lets a keyboard user skip the topbar and chrome. */}
        <a
          href="#konten-utama"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-sm focus:border focus:border-civic focus:bg-surface focus:px-3 focus:py-2 focus:text-xs focus:font-medium focus:text-civic"
        >
          Lompat ke konten utama
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
