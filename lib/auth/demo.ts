/**
 * Demo credentials for the seeded training village (Desa Sukamaju).
 *
 * These are LOCAL DEV SEED DATA, clearly marked as such: they exist so the
 * demo database is loggable out of the box and are only ever surfaced in the
 * UI when NODE_ENV !== "production". In production every account uses real,
 * individually-set credentials — nothing here is a secret.
 */

export const DEMO_STAFF_EMAIL = "operator@sukamaju.desa.id";
export const DEMO_STAFF_PASSWORD = "sukamaju-2026";

/** The demo resident gets a portal account; NIK is fixed so docs stay stable. */
export const DEMO_WARGA_NIK = "3204160101801234";
export const DEMO_WARGA_PASSWORD = "warga-sukamaju-2026";
