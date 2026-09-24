/**
 * Electronic-signature credentials — shared constants.
 *
 * Kept free of Node built-ins so client components can render the training hint
 * without pulling `node:crypto` into the browser bundle. The digests themselves
 * live in `lib/esign-server.ts`.
 */

/**
 * Training default for the Kepala Desa's BSrE passphrase.
 *
 * The dashboard is a working demonstration, so the ceremony has to be
 * completable — a credential nobody knows would make the flow untestable. Real
 * deployments inject the operator's own secret through `ESIGN_PASSPHRASE` at
 * seed time and never ship a default. The value is surfaced in the UI under an
 * explicit "lingkungan latihan" label so it reads as a demo affordance rather
 * than production copy.
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
