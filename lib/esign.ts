export const ESIGN_TRAINING_PASSPHRASE = "sukamaju-ttd-2026";

/** Resolves the passphrase seeded onto the signer's account. */
export function readEsignPassphrase() {
  const configured = process.env.ESIGN_PASSPHRASE?.trim();
  return {
    passphrase: configured && configured.length >= 8 ? configured : ESIGN_TRAINING_PASSPHRASE,
    isTrainingDefault: !(configured && configured.length >= 8),
  };
}