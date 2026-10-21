import "server-only";

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const UPLOAD_ROOT =
  process.env.UPLOAD_ROOT ?? path.join(process.cwd(), ".data", "storage");
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

/**
 * Where an uploaded file belongs: letter-request scans or citizen-report
 * photos. The produced key for `requests` is byte-identical to the historical
 * layout so already-stored scans keep resolving after the refactor.
 */
export type AttachmentScope =
  | { collection: "requests"; id: string }
  | { collection: "reports"; id: string };

function extensionFor(mimeType: string) {
  return EXTENSIONS[mimeType] ?? ".bin";
}
function resolveKey(storageKey: string) {
  const absolute = path.resolve(UPLOAD_ROOT, storageKey);
  const root = path.resolve(UPLOAD_ROOT);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Invalid storage key: ${storageKey}`);
  }
  return absolute;
}

export async function saveUpload(input: {
  villageId: string;
  scope: AttachmentScope;
  name: string;
  mimeType: string;
  data: Uint8Array;
}): Promise<StoredAttachmentFile> {
  const safeName = input.name
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 60)
    .toLowerCase();
  const name = `${safeName}-${randomBytes(6).toString("hex")}${extensionFor(input.mimeType)}`;
  const storageKey = `${ATTACHMENT_KEY_PREFIX}/villages/${input.villageId}/${input.scope.collection}/${input.scope.id}/${name}`;

  const absolute = resolveKey(storageKey);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, input.data);

  return { storageKey, sizeBytes: input.data.byteLength };
}

/**
 * Legacy helper for letter-request scans: the document key names the file
 * (`ktp-<random>.jpg`) exactly as it always has.
 */
export async function saveAttachment(input: {
  villageId: string;
  requestId: string;
  docKey: string;
  mimeType: string;
  data: Uint8Array;
}): Promise<StoredAttachmentFile> {
  const docKey = input.docKey.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40);
  return saveUpload({
    villageId: input.villageId,
    scope: { collection: "requests", id: input.requestId },
    name: docKey.toLowerCase().replace(/_/g, "-"),
    mimeType: input.mimeType,
    data: input.data,
  });
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
