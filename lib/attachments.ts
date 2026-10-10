import "server-only";

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Local object store for uploaded scans.
 *
 * The system runs on an embedded database (PGlite) with no external services,
 * so uploads land on the same disposable volume under `.data/` — gitignored and
 * rebuilt by `npm run db:reset`, exactly like the database files. Rows only ever
 * carry a `storage_key`; the bytes are streamed back through the API and never
 * exposed as a public URL.
 */
export const UPLOAD_ROOT =
  process.env.UPLOAD_ROOT ?? path.join(process.cwd(), ".data", "storage");

/**
 * Namespace prefix that marks a key as written by this store. Seeded demo rows
 * carry keys without it, so the review drawer knows those have no bytes behind
 * them and keeps showing its placeholder.
 */
export const ATTACHMENT_KEY_PREFIX = "uploads";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "application/pdf": ".pdf",
};

export type StoredAttachmentFile = {
  storageKey: string;
  sizeBytes: number;
};

function extensionFor(mimeType: string) {
  return EXTENSIONS[mimeType] ?? ".bin";
}

/** Joins a storage key onto the upload root, refusing anything that escapes it. */
function resolveKey(storageKey: string) {
  const absolute = path.resolve(UPLOAD_ROOT, storageKey);
  const root = path.resolve(UPLOAD_ROOT);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Invalid storage key: ${storageKey}`);
  }
  return absolute;
}

/** Persists one uploaded scan and returns the key to store on the row. */
export async function saveAttachment(input: {
  villageId: string;
  requestId: string;
  docKey: string;
  mimeType: string;
  data: Uint8Array;
}): Promise<StoredAttachmentFile> {
  const docKey = input.docKey.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40);
  const name = `${docKey.toLowerCase().replace(/_/g, "-")}-${randomBytes(6).toString("hex")}${extensionFor(input.mimeType)}`;
  const storageKey = `${ATTACHMENT_KEY_PREFIX}/villages/${input.villageId}/requests/${input.requestId}/${name}`;

  const absolute = resolveKey(storageKey);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, input.data);

  return { storageKey, sizeBytes: input.data.byteLength };
}

/** Reads the bytes behind a storage key, or null when the file is missing. */
export async function readAttachment(
  storageKey: string,
): Promise<Uint8Array | null> {
  try {
    return await fs.readFile(resolveKey(storageKey));
  } catch {
    return null;
  }
}

/** Best-effort cleanup when a write is rolled back after the bytes landed. */
export async function deleteAttachments(storageKeys: string[]): Promise<void> {
  await Promise.all(
    storageKeys.map(async (key) => {
      try {
        await fs.unlink(resolveKey(key));
      } catch {
        // Already gone, or never written — nothing to clean up.
      }
    }),
  );
}
