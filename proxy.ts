import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/policy";

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

const LOGIN_PAGES = new Set(["/masuk", "/warga/masuk"]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (LOGIN_PAGES.has(pathname) && hasSessionCookie) {
    const home = pathname === "/warga/masuk" ? "/warga" : "/";

    return NextResponse.redirect(new URL(home, request.url));
  }

  if (STAFF_PAGES.has(pathname) && !hasSessionCookie) {
    const login = new URL("/masuk", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
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
