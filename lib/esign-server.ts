/**
 * E-signature passphrase digests.
 *
 * Re-exported from the single password helper so the login and signing
 * ceremonies never drift into two hashing implementations.
 */
export {
  hashPassword as hashPassphrase,
  verifyPassword as verifyPassphrase,
} from "@/lib/auth/password";
