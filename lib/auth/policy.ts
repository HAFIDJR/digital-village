export const SESSION_COOKIE = "dv_session";
export const SESSION_TTL_MS = 12 * 3_600_000;
export const SESSION_RENEW_WINDOW_MS = 4 * 3_600_000;
export const PRESENCE_THROTTLE_MS = 2 * 60_000;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60_000;
export const MAX_SIGN_ATTEMPTS = 15;

export const LOGIN_STATIONS = [
  "Loket Pelayanan",
  "Verifikasi Berkas",
  "Ruang Kepala Desa",
  "Tata Usaha",
] as const;

export type LoginStation = (typeof LOGIN_STATIONS)[number];

export function lockoutMinutesLeft(lockedUntil: Date | string, now = new Date()): number {
  const until = typeof lockedUntil === "string" ? new Date(lockedUntil) : lockedUntil;
  return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
}

export function sanitizeRedirectPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.includes("://")) return fallback;
  if (value === "/masuk" || value.startsWith("/masuk?")) return fallback;
  if (value === "/warga/masuk" || value.startsWith("/warga/masuk?")) return fallback;
  return value;
}
