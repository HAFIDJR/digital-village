export const REPORT_IMAGE_ACCEPT = ["image/jpeg", "image/png", "image/webp"] as const;
export const REPORT_IMAGE_MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const REPORT_IMAGE_MAX_OUTPUT_BYTES = 400 * 1024;
export const REPORT_IMAGE_MAX_EDGE = 1600;
export const REPORT_IMAGE_MAX_COUNT = 4;

export type NormalisedImage = {
  blob: Blob;
  fileName: string;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  sizeBytes: number;
  originalSizeBytes: number;
  previewUrl: string;
};

function baseName(fileName: string) {
  const trimmed = fileName.replace(/\.[^.]+$/, "").trim();
  return (trimmed || "foto").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
}

export function imageValidationError(file: File): string | null {
  if (file.size === 0) {
    return "Foto kosong. Pilih ulang berkas foto yang valid.";
  }
  if (!(REPORT_IMAGE_ACCEPT as readonly string[]).includes(file.type)) {
    return "Format foto harus JPG atau PNG.";
  }
  if (file.size > REPORT_IMAGE_MAX_INPUT_BYTES) {
    return "Ukuran foto maksimal 10 MB.";
  }
  return null;
}

function scaleFor(width: number, height: number, maxEdge: number) {
  if (width <= maxEdge && height <= maxEdge) return { width, height };
  const ratio = maxEdge / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: "image/jpeg" | "image/png",
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      mimeType,
      mimeType === "image/jpeg" ? quality : undefined,
    );
  });
}

async function encode(
  bitmap: ImageBitmap,
  target: { width: number; height: number },
  keepPng: boolean,
): Promise<{ blob: Blob; mimeType: "image/jpeg" | "image/png"; width: number; height: number }> {
  const offscreen: OffscreenCanvas | null =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(target.width, target.height)
      : null;

  let canvas: OffscreenCanvas | HTMLCanvasElement;
  if (offscreen) {
    canvas = offscreen;
  } else {
    const element = document.createElement("canvas");
    element.width = target.width;
    element.height = target.height;
    canvas = element;
  }

  const context = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!context) {
    throw new Error("Kanvas tidak tersedia pada peramban ini.");
  }

  if (!keepPng) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, target.width, target.height);
  }
  context.drawImage(bitmap, 0, 0, target.width, target.height);

  if (keepPng) {
    const blob = offscreen
      ? await (offscreen as OffscreenCanvas).convertToBlob({ type: "image/png" })
      : await canvasToBlob(canvas as HTMLCanvasElement, "image/png", 1);
    if (!blob) throw new Error("Foto gagal disimpan sebagai PNG.");
    return { blob, mimeType: "image/png", width: target.width, height: target.height };
  }
  
  let currentTarget = target;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const qualities = [0.82, 0.7, 0.6, 0.5];
    const quality = qualities[Math.min(attempt, qualities.length - 1)];

    if (attempt >= qualities.length) {
      currentTarget = {
        width: Math.max(320, Math.round(currentTarget.width / 2)),
        height: Math.max(320, Math.round(currentTarget.height / 2)),
      };
      canvas.width = currentTarget.width;
      canvas.height = currentTarget.height;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, currentTarget.width, currentTarget.height);
      context.drawImage(bitmap, 0, 0, currentTarget.width, currentTarget.height);
    }

    const blob = offscreen
      ? await (offscreen as OffscreenCanvas).convertToBlob({
          type: "image/jpeg",
          quality,
        })
      : await canvasToBlob(canvas as HTMLCanvasElement, "image/jpeg", quality);
    if (!blob) throw new Error("Foto gagal dikompresi oleh peramban.");
    if (blob.size <= REPORT_IMAGE_MAX_OUTPUT_BYTES || currentTarget.width <= 320) {
      return {
        blob,
        mimeType: "image/jpeg",
        width: currentTarget.width,
        height: currentTarget.height,
      };
    }
  }

  throw new Error("Foto tidak dapat diperkecil hingga batas kuota desa.");
}

export async function normaliseImage(file: File): Promise<NormalisedImage> {
  const invalid = imageValidationError(file);
  if (invalid) throw new Error(invalid);

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Foto tidak dapat dibaca. Pastikan berkas bukan foto rusak.");
  }

  try {
    const target = scaleFor(bitmap.width, bitmap.height, REPORT_IMAGE_MAX_EDGE);
    const hasAlpha = file.type === "image/png";
    const keepPng = hasAlpha && file.size <= REPORT_IMAGE_MAX_OUTPUT_BYTES;

    const encoded = await encode(bitmap, target, keepPng);
    const previewUrl = URL.createObjectURL(encoded.blob);

    return {
      blob: encoded.blob,
      fileName: `${baseName(file.name)}.${encoded.mimeType === "image/png" ? "png" : "jpg"}`,
      mimeType: encoded.mimeType,
      width: encoded.width,
      height: encoded.height,
      sizeBytes: encoded.blob.size,
      originalSizeBytes: file.size,
      previewUrl,
    };
  } finally {
    bitmap.close();
  }
}