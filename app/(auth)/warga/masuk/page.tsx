import type { Metadata } from "next";
import { Users } from "lucide-react";

import { WargaLoginForm } from "@/components/auth/warga-login-form";
import { redirectIfAuthenticated } from "@/lib/auth/guard";
import { sanitizeRedirectPath } from "@/lib/auth/policy";
import { DEMO_WARGA_NIK, DEMO_WARGA_PASSWORD } from "@/lib/auth/demo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Masuk Portal Warga",
  description:
    "Masuk ke portal warga Desa Sukamaju untuk memantau status pengajuan surat Anda.",
  robots: { index: false, follow: false },
};

/** Resident login — NIK + password issued at the village counter. */
export default async function WargaMasukPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await redirectIfAuthenticated();

  const params = await searchParams;
  const nextPath = sanitizeRedirectPath(params.next, "/warga");

  return (
    <main className="w-full max-w-sm">
      <div className="rounded-lg border border-line bg-surface p-5 shadow-layer-1">
        <div className="mb-4 flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-sm border border-civic/25 bg-civic-soft text-civic">
            <Users className="size-4" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-sm font-bold tracking-[-0.01em] text-fg">
              Masuk Portal Warga
            </h1>
            <p className="mt-0.5 text-2xs leading-4 text-fg-subtle">
              Pantau status pengajuan surat Anda dan unduh salinan yang sudah
              ditandatangani.
            </p>
          </div>
        </div>

        <WargaLoginForm
          nextPath={nextPath}
          devCredentials={
            process.env.NODE_ENV === "production"
              ? null
              : { nik: DEMO_WARGA_NIK, password: DEMO_WARGA_PASSWORD }
          }
        />
      </div>

      <p className="mt-3 text-center text-2xs leading-4 text-fg-subtle">
        Petugas desa?{" "}
        <a href="/masuk" className="font-medium text-civic underline underline-offset-2">
          Masuk dashboard pelayanan
        </a>
        .
      </p>
    </main>
  );
}
