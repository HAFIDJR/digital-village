import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Badge — used for letter types, document completeness and statuses.
 *
 * Shape note: status badges are the ONE place the system allows a rounded pill,
 * because they sit inline inside dense rows and a pill reads as a label rather
 * than a button. Everything else is a 4–6px rectangle.
 */
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1 border font-medium whitespace-nowrap",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        neutral: "border-line-strong/70 bg-surface-muted text-fg-muted",
        pending: "border-pending-line/70 bg-pending-bg text-pending",
        approved: "border-approved-line/70 bg-approved-bg text-approved",
        rejected: "border-rejected-line/70 bg-rejected-bg text-rejected",
        progress: "border-progress-line/70 bg-progress-bg text-progress",
        civic: "border-civic/25 bg-civic-soft text-civic",
        ink: "border-ink bg-ink text-white",
        outline: "border-line-strong bg-surface text-fg-muted",
      },
      size: {
        sm: "h-[18px] rounded-xs px-1.5 text-2xs [&_svg]:size-3",
        default: "h-[22px] rounded-full px-2 text-2xs [&_svg]:size-3",
        md: "h-6 rounded-full px-2.5 text-xs [&_svg]:size-3.5",
      },
      mono: { true: "font-mono tnum tracking-tight", false: "" },
    },
    defaultVariants: { variant: "neutral", size: "default", mono: false },
  },
);

export type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean };

export function Badge({ className, variant, size, mono, asChild, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant, size, mono }), className)}
      {...props}
    />
  );
}

export { badgeVariants };
