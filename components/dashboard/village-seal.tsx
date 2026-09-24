"use client";

import { Landmark, Wifi, WifiOff } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Village identity block for the topbar: seal, official name line, and the
 * connection indicator.
 *
 * Fallback behaviour matters here: `sealUrl` points at an operator-uploaded
 * asset, so a broken or missing file must degrade to a neutral emblem rather
 * than a broken-image icon on the government letterhead.
 */
export function VillageSeal({
  name,
  regency,
  sealUrl,
  isOnline = true,
}: {
  name: string;
  regency: string;
  sealUrl?: string | null;
  isOnline?: boolean;
}) {
  const [failed, setFailed] = React.useState(false);
  const showImage = Boolean(sealUrl) && !failed;

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className={cn(
          "relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-md",
          "border border-line-strong bg-surface-muted",
        )}
      >
        {showImage ? (
          // A plain <img>, not next/image: the seal is a tiny local SVG that
          // would only pay the optimiser's overhead.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sealUrl ?? ""}
            alt={`Lambang ${name}`}
            width={36}
            height={36}
            className="size-full object-contain"
            onError={() => setFailed(true)}
          />
        ) : (
          <Landmark className="size-4 text-fg-subtle" aria-hidden />
        )}
      </span>

      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate font-display text-[13px] font-bold leading-4 tracking-[-0.01em] text-fg">
          Pemerintah {name}
          <ConnectionDot online={isOnline} />
        </p>
        <p className="truncate text-2xs leading-4 text-fg-subtle">{regency}</p>
      </div>
    </div>
  );
}

/**
 * Connectivity indicator.
 *
 * Rendered next to the village name because "is the network up?" is the first
 * question an operator asks when a submission fails to appear — and the answer
 * should not require opening devtools.
 */
function ConnectionDot({ online }: { online: boolean }) {
  const Icon = online ? Wifi : WifiOff;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-grid size-4 shrink-0 place-items-center rounded-full",
            online ? "text-approved" : "text-rejected",
          )}
          tabIndex={0}
          aria-label={online ? "Terhubung ke jaringan desa" : "Tidak ada koneksi"}
        >
          <Icon className="size-3" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {online
          ? "Terhubung ke server desa (10.10.4.2)"
          : "Koneksi terputus — perubahan belum dapat disimpan"}
      </TooltipContent>
    </Tooltip>
  );
}
