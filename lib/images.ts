export const REPORT_IMAGE_ACCEPT = ["image/jpeg", "image/png", "image/webp"] as const;
export const REPORT_IMAGE_MAX_INPUT_BYTES = 10 * 1024 * 1024; // reject before decoding
export const REPORT_IMAGE_MAX_OUTPUT_BYTES = 400 * 1024; // compression target
export const REPORT_IMAGE_MAX_EDGE = 1600; // px, longest edge
export const REPORT_IMAGE_MAX_COUNT = 4;

export type NormalisedImage = {
  blob: Blob;
  fileName: string;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  sizeBytes: number;
  originalSizeBytes: number;
  previewUrl: string; // URL.createObjectURL — revoke!
};

export async function normaliseImage(file: File): Promise<NormalisedImage> {
  const orientationAware = createImageBitmap(file, { imageOrientation: "from-image" });

  const canvas = document.createElement("canvas");
  const bitmap = await orientationAware;

  // Scale so longest edge <= REPORT_IMAGE_MAX_EDGE
  let width = bitmap.width;
  let height = bitmap.height;
  const maxEdge = Math.max(width, height);

  if (maxEdge > REPORT_IMAGE_MAX_EDGE) {
    const ratio = REPORT_IMAGE_MAX_EDGE / maxEdge;
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  const compressedBlob = await (await fetch(dataUrl)).blob();

  // Optimize quality until <= REPORT_IMAGE_MAX_OUTPUT_BYTES
  let quality = 0.82;
  let currentSize = compressedBlob.size;

  while (currentSize > REPORT_IMAGE_MAX_OUTPUT_BYTES && quality > 0.5) {
    quality -= 0.1;
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
    const newDataUrl = canvas.toDataURL("image/jpeg", quality);
    currentSize = (await (await fetch(newDataUrl)).blob()).size;
  }

  // If still too big, halve the edge and retry
  if (currentSize > REPORT_IMAGE_MAX_OUTPUT_BYTES) {
    const newWidth = Math.max(1, Math.round(width / 2));
    const newHeight = Math.max(1, Math.round(height / 2));
    canvas.width = newWidth;
    canvas.height = newHeight;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, newWidth, newHeight);
    const finalDataUrl = canvas.toDataURL("image/jpeg", 0.7);
    const finalBlob = await (await fetch(finalDataUrl)).blob();
    URL.revokeObjectURL(dataUrl);
    bitmap.close();
    return {
      blob: finalBlob,
      fileName: file.name,
      mimeType: "image/jpeg",
      width: newWidth,
      height: newHeight,
      sizeBytes: finalBlob.size,
      originalSizeBytes: file.size,
      previewUrl: URL.createObjectURL(finalBlob),
    };
  }

  URL.revokeObjectURL(dataUrl);
  bitmap.close();

  return {
    blob: compressedBlob,
    fileName: file.name,
    mimeType: "image/jpeg",
    width,
    height,
    sizeBytes: currentSize,
    originalSizeBytes: file.size,
    previewUrl: URL.createObjectURL(compressedBlob),
  };
}

export function imageValidationError(file: File): string | null {
  const acceptedTypes = REPORT_IMAGE_ACCEPT;
  if (!acceptedTypes.includes(file.type as any)) {
    return "Format foto harus JPG atau PNG.";
  }
  if (file.size > REPORT_IMAGE_MAX_INPUT_BYTES) {
    return "Ukuran foto maksimal 10 MB.";
  }
  return null;
}