import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = scryptSync(password.normalize("NFKC"), salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export function verifyPassword(
  password: string,
  stored: string | null | undefined,
): boolean {
  if (!stored) return false;

  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(keyHex, "hex");
  } catch {
    return false;
  }

  const actual = scryptSync(
    password.normalize("NFKC"),
    Buffer.from(saltHex, "hex"),
    expected.length,
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const DUMMY_HASH = hashPassword("dv-timing-equalizer");
export function burnDummyVerify(password: string): void {
  verifyPassword(password, DUMMY_HASH);
}
