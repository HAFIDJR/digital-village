/**
 * Pure auth policy — no imports, safe on the client and the server.
 *
 * Session TTL, lockout thresholds and redirect sanitisation live here so the
 * route handlers, the server guards and the login forms can never disagree
 * about the rules. Nothing in this file touches the database or Node APIs.
 */

/** httpOnly cookie carrying the opaque session id (never the identity itself). */
export const SESSION_COOKIE = "dv_session";

/** Sessions live 12 hours and roll forward while the user stays active. */
export const SESSION_TTL_MS = 12 * 3_600_000;
/** Renew the expiry once less than this much of the TTL remains. */
export const SESSION_RENEW_WINDOW_MS = 4 * 3_600_000;
/** Touch an actor's presence stamp at most this often. */
export const PRESENCE_THROTTLE_MS = 2 * 60_000;

/** Failed-credential attempts tolerated before a temporary lockout. */
export const MAX_LOGIN_ATTEMPTS = 5;
/** How long a locked account stays locked. */
export const LOCKOUT_MS = 15 * 60_000;
/** Same policy for the e-sign certificate passphrase. */
export const MAX_SIGN_ATTEMPTS = 5;

/** Login stations offered to staff, kept in the pelayanan-publik register. */
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

/**
 * Only same-app absolute paths pass. Blocks open redirects (`//evil.com`,
 * `https://evil.com`) and auth pages themselves, which would otherwise loop.
 */
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
