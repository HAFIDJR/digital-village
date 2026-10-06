/**
 * E-sign passphrase configuration for the seed and the (dev-only) sign dialog
 * hint.
 *
 * NOTE: server-side module — imported by the seed scripts and the shell
 * payload, never by client components. It deliberately does not carry the
 * `server-only` marker so `tsx` seed scripts can load it; the training value
 * it may expose is dev seed data, never a production secret.
 */

export const ESIGN_TRAINING_PASSPHRASE = "sukamaju-ttd-2026";

/** Resolves the passphrase seeded onto the signer's account. */
export function readEsignPassphrase() {
  const configured = process.env.ESIGN_PASSPHRASE?.trim();
  return {
    passphrase: configured && configured.length >= 8 ? configured : ESIGN_TRAINING_PASSPHRASE,
    isTrainingDefault: !(configured && configured.length >= 8),
  };
}

/**
 * The hint the sign dialog may show for the seeded demo signer.
 *
 * Only ever non-null when ALL of these hold:
 *  - the app runs outside production, and
 *  - no real `ESIGN_PASSPHRASE` was configured.
 *
 * In production a signer must activate their own passphrase via "Profil &
 * Hak Akses" — there is no shared fallback and nothing to display.
 */
export function readEsignTrainingHint(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.ESIGN_PASSPHRASE?.trim()) return null;
  return ESIGN_TRAINING_PASSPHRASE;
}
