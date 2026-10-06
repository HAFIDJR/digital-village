import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing for every credential in the app — staff logins, resident
 * portal logins and the e-sign certificate passphrase all share one scheme.
 *
 * The format is `scrypt$<salt-hex>$<key-hex>` (N=16384 defaults from Node),
 * the same scheme the signature feature already used, generalised here so no
 * second hashing scheme ever enters the codebase.
 */

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = scryptSync(password.normalize("NFKC"), salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;

  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(keyHex, "hex");
  } catch {
    return false;
  }

  const actual = scryptSync(password.normalize("NFKC"), Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * A pre-computed digest of a random value: burning a scrypt verification when
 * the account does not exist keeps "unknown email" and "wrong password"
 * indistinguishable by timing.
 */
const DUMMY_HASH = hashPassword("dv-timing-equalizer");
export function burnDummyVerify(password: string): void {
  verifyPassword(password, DUMMY_HASH);
}
