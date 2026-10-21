"use client";

import { CircleAlert, ImagePlus, LoaderCircle, X } from "lucide-react";
import * as React from "react";

import { Input } from "@/components/ui/primitives";
import { formatBytes } from "@/lib/format";
import {
  REPORT_IMAGE_ACCEPT,
  REPORT_IMAGE_MAX_COUNT,
  imageValidationError,
  normaliseImage,
  type NormalisedImage,
} from "@/lib/images";

/** A picked photo plus the caption the reporter typed under it. */
export type PickedImage = NormalisedImage & { caption: string };

/**
 * Builds the multipart payload every report-photo endpoint expects: files
 * keyed `file:0`, `file:1`, … plus a JSON `attachments` hint array carrying
 * width/height/caption per index. The server rebuilds the manifest from the
 * received bytes; the hints are decoration.
 */
export function appendReportImages(form: FormData, images: PickedImage[]) {
  images.forEach((image, index) => {
    form.append(`file:${index}`, image.blob, image.fileName);
  });
  form.append(
    "attachments",
    JSON.stringify(
      images.map((image) => ({
        width: image.width,
        height: image.height,
        caption: image.caption.trim() || undefined,
      })),
    ),
  );
}

/**
 * The one photo picker for laporan warga — used by the portal filing form,
 * the portal edit dialog and the staff drawer. Files are validated and
 * compressed in the browser (see `lib/images.ts`) before anything is sent;
 * the server re-checks every limit.
 */
export function ReportImagePicker({
  images,
  onImagesChange,
  busy = false,
  idPrefix,
}: {
  images: PickedImage[];
  onImagesChange: (next: PickedImage[]) => void;
  /** Disables the input while the parent mutation is in flight. */
  busy?: boolean;
  /** Keeps DOM ids unique when several pickers share a page. */
  idPrefix: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const remaining = REPORT_IMAGE_MAX_COUNT - images.length;

  // Object URLs live as long as the picker; revoke whatever is still held on
  // unmount. The ref is written from an effect, never during render.
  const imagesRef = React.useRef<PickedImage[]>(images);
  React.useEffect(() => {
    imagesRef.current = images;
  }, [images]);
  React.useEffect(() => {
    return () => {
      for (const image of imagesRef.current) URL.revokeObjectURL(image.previewUrl);
    };
  }, []);

  const remove = (index: number) => {
    const next = images.filter((_, position) => position !== index);
    const removed = images[index];
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    onImagesChange(next);
  };

  const setCaption = (index: number, caption: string) => {
    onImagesChange(
      images.map((image, position) =>
        position === index ? { ...image, caption } : image,
      ),
    );
  };

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = ""; // allow re-picking the same file
    if (!picked.length) return;
    setError(null);

    if (picked.length > remaining) {
      setError(
        `Maksimal ${REPORT_IMAGE_MAX_COUNT} foto per laporan. Hapus salah satu foto sebelum menambahkan yang baru.`,
      );
      return;
    }

    setProcessing(true);
    const accepted: PickedImage[] = [];
    try {
      for (const file of picked) {
        const invalid = imageValidationError(file);
        if (invalid) {
          setError(`${file.name}: ${invalid}`);
          continue;
        }
        try {
          const image = await normaliseImage(file);
          accepted.push({ ...image, caption: "" });
        } catch (normaliseError) {
          setError(
            `${file.name}: ${normaliseError instanceof Error ? normaliseError.message : "Foto gagal diproses."}`,
          );
        }
      }
      if (accepted.length) onImagesChange([...images, ...accepted]);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        id={`${idPrefix}-file`}
        type="file"
        accept={REPORT_IMAGE_ACCEPT.join(",")}
        multiple
        className="sr-only"
        onChange={(event) => void pick(event)}
        disabled={processing || busy || remaining === 0}
        aria-label="Pilih foto laporan"
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {images.map((image, index) => (
          <figure
            key={image.previewUrl}
            className="group relative overflow-hidden rounded-sm border border-line bg-surface-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.previewUrl}
              alt={`Pratinjau foto laporan ${index + 1}`}
              className="aspect-square w-full object-cover"
            />
            <button
              type="button"
              onClick={() => remove(index)}
              disabled={processing || busy}
              aria-label={`Hapus foto ${image.fileName}`}
              className="absolute right-1 top-1 grid size-5 place-items-center rounded-xs border border-line bg-surface/90 text-fg-subtle transition-colors hover:border-rejected hover:text-rejected disabled:opacity-50"
            >
              <X className="size-3" aria-hidden />
            </button>
            <figcaption className="space-y-1 p-1.5">
              <Input
                value={image.caption}
                maxLength={160}
                onChange={(event) => setCaption(index, event.target.value)}
                placeholder="Keterangan foto (opsional)"
                aria-label={`Keterangan foto ${index + 1}`}
                className="h-6 text-[10px]"
                disabled={processing || busy}
              />
              <span className="tnum block truncate text-[10px] text-fg-subtle">
                {image.width}×{image.height} px · {formatBytes(image.sizeBytes)}
              </span>
            </figcaption>
          </figure>
        ))}

        {remaining > 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={processing || busy}
            aria-label={`Tambah foto laporan (${remaining} slot tersisa)`}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-sm border border-dashed border-line-strong bg-surface-muted text-fg-subtle transition-colors hover:border-civic hover:text-civic disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processing ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="size-4" aria-hidden />
            )}
            <span className="text-[10px] font-medium">
              {processing ? "Memproses foto…" : `Tambah foto (${remaining})`}
            </span>
          </button>
        ) : null}
      </div>

      {processing ? (
        <p role="status" className="mt-1.5 text-[10px] text-fg-subtle">
          Foto diperkecil di peramban sebelum diunggah…
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-1.5 flex items-start gap-1.5 rounded-sm border border-rejected-line/60 bg-rejected-bg px-2 py-1.5 text-[10px] text-rejected"
        >
          <CircleAlert className="mt-px size-3 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <p className="mt-1.5 text-[10px] leading-4 text-fg-subtle">
        Maksimal {REPORT_IMAGE_MAX_COUNT} foto (JPG/PNG, maks. 10 MB per foto).
        Foto otomatis diperkecil agar hemat kuota; keterangan membantu petugas
        memahami lokasi kejadian.
      </p>
    </div>
  );
}
