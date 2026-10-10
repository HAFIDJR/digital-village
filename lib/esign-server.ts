import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
export { hashPassword as hashPassphrase, verifyPassword as verifyPassphrase } from "@/lib/auth/password";

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export function hashPassphrase(passphrase: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = scryptSync(passphrase.normalize("NFKC"), salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPassphrase(passphrase: string, stored: string | null | undefined): boolean {
  if (!stored) return false;

  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(keyHex, "hex");
  } catch {
    return false;
  }

  const actual = scryptSync(passphrase.normalize("NFKC"), Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}