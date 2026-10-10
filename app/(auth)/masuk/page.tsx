import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { StaffLoginForm } from "@/components/auth/staff-login-form";
import { redirectIfAuthenticated } from "@/lib/auth/guard";
import { sanitizeRedirectPath } from "@/lib/auth/policy";
import { DEMO_STAFF_EMAIL, DEMO_STAFF_PASSWORD } from "@/lib/auth/demo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Masuk Petugas Desa",
  description:
    "Masuk ke dashboard pelayanan Desa Sukamaju. Khusus perangkat desa dengan email instansi.",
  robots: { index: false, follow: false },
};

export default async function MasukPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  await redirectIfAuthenticated();

  const params = await searchParams;
  const nextPath = sanitizeRedirectPath(params.next, "/");

  return (
    <main className="w-full max-w-sm">
      <div className="rounded-lg border border-line bg-surface p-5 shadow-layer-1">
        <div className="mb-4 flex items-start gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-sm border border-civic/25 bg-civic-soft text-civic">
            <ShieldCheck className="size-4" aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-sm font-bold tracking-[-0.01em] text-fg">
              Masuk Petugas Desa
            </h1>
            <p className="mt-0.5 text-2xs leading-4 text-fg-subtle">
              Dashboard operator &amp; perangkat desa. Masuk akan membuka shift
              pelayanan Anda.
            </p>
          </div>
        </div>

        <StaffLoginForm
          nextPath={nextPath}
          devCredentials={
            process.env.NODE_ENV === "production"
              ? null
              : { email: DEMO_STAFF_EMAIL, password: DEMO_STAFF_PASSWORD }
          }
        />
      </div>

      <p className="mt-3 text-center text-2xs leading-4 text-fg-subtle">
        Warga? Cek status surat Anda melalui{" "}
        <a
          href="/warga/masuk"
          className="font-medium text-civic underline underline-offset-2"
        >
          Portal Warga
        </a>
        .
      </p>
    </main>
  );
}