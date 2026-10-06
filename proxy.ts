import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/policy";

/**
 * Route protection at the edge of the app.
 *
 * Next.js 16 renamed the `middleware` file convention to `proxy` — this file
 * is that convention (see node_modules/next/dist/docs, "proxy.js"). Per the
 * docs, proxy code must not rely on shared modules or a database, so this is a
 * deliberately cheap gate: it only checks *cookie presence*. The authoritative
 * session validation (session row, actor type, role) happens server-side in
 * the layouts (`requireStaffPage`) and API routes (`requireStaffSession`) —
 * defence in depth, and never a trust decision made on a cookie alone.
 */

/** Exact dashboard paths — the app has no nested dashboard routes today. */
const STAFF_PAGES = new Set([
  "/",
  "/antrean",
  "/arsip",
  "/bantuan",
  "/keluarga",
  "/laporan",
  "/penduduk",
  "/pengaturan",
  "/pengumuman",
  "/situs",
  "/ttd",
  "/verifikasi",
  "/wilayah",
]);

/** Login pages send already-authenticated visitors home. */
const LOGIN_PAGES = new Set(["/masuk", "/warga/masuk"]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (LOGIN_PAGES.has(pathname) && hasSessionCookie) {
    // The cookie might be stale; the destination re-checks the session and
    // bounces back to login if it is. Either way the login form is skipped.
    const home = pathname === "/warga/masuk" ? "/warga" : "/";
    return NextResponse.redirect(new URL(home, request.url));
  }

  if (STAFF_PAGES.has(pathname) && !hasSessionCookie) {
    // Preserve the originally requested page so login can return to it.
    const login = new URL("/masuk", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  // Constant paths only, per the docs (matchers must be statically
  // analysable). Public surfaces — /masuk, /warga/*, /verifikasi/[code],
  // /api/* — are intentionally absent: APIs enforce their own auth, and the
  // verification landing page must stay open to any phone with a QR code.
  matcher: [
    "/",
    "/masuk",
    "/antrean",
    "/arsip",
    "/bantuan",
    "/keluarga",
    "/laporan",
    "/penduduk",
    "/pengaturan",
    "/pengumuman",
    "/situs",
    "/ttd",
    "/verifikasi",
    "/wilayah",
  ],
};
