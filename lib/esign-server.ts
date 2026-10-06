/**
 * Compatibility shim: the scrypt helpers used to live here, specific to the
 * e-sign passphrase. They moved to `lib/auth/password.ts` when logins adopted
 * the same scheme, so every credential in the app is hashed identically.
 */
export { hashPassword as hashPassphrase, verifyPassword as verifyPassphrase } from "@/lib/auth/password";
