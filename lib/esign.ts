export const ESIGN_TRAINING_PASSPHRASE = "sukamaju-ttd-2026";

/** Resolves the passphrase seeded onto the signer's account. */
export function readEsignPassphrase() {
  const configured = process.env.ESIGN_PASSPHRASE?.trim();
  return {
    passphrase: configured && configured.length >= 8 ? configured : ESIGN_TRAINING_PASSPHRASE,
    isTrainingDefault: !(configured && configured.length >= 8),
  };
}

export function readEsignTrainingHint(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.ESIGN_PASSPHRASE?.trim()) return null;
  return ESIGN_TRAINING_PASSPHRASE;
}