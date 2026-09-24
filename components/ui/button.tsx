"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Button.
 *
 * Ergonomics for 8-hour data entry drove these choices:
 *  - 32px default height keeps full-day click targets comfortable without
 *    inflating dense table rows.
 *  - `primary` is Civic Navy, not black: the darkest ink is reserved for text.
 *  - every variant keeps a visible 1px border so buttons read as physical
 *    controls on the flush white surface, never as floating pills.
 */
const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center gap-1.5",
    "whitespace-nowrap rounded-sm font-medium",
    "transition-[background-color,border-color,color,box-shadow] duration-100",
    "disabled:pointer-events-none disabled:opacity-45",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-civic/55 focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
  ],
  {
    variants: {
      variant: {
        primary:
          "border border-civic bg-civic text-white hover:bg-civic-hover hover:border-civic-hover active:bg-civic-active",
        secondary:
          "border border-line-strong bg-surface text-fg hover:bg-surface-muted active:bg-surface-sunken",
        outline:
          "border border-line-strong bg-surface text-fg-muted hover:border-slate-400 hover:bg-surface-muted hover:text-fg",
        ghost: "border border-transparent bg-transparent text-fg-muted hover:bg-surface-muted hover:text-fg",
        ink: "border border-ink bg-ink text-white hover:bg-ink-hover hover:border-ink-hover",
        danger:
          "border border-rejected-line bg-rejected-bg text-rejected hover:border-rejected-solid/60 hover:bg-rejected-solid/10",
        success:
          "border border-approved-line bg-approved-bg text-approved hover:border-approved-solid/60 hover:bg-approved-solid/10",
        pending:
          "border border-pending-line bg-pending-bg text-pending hover:border-pending-solid/60 hover:bg-pending-solid/10",
        link: "border border-transparent bg-transparent text-civic underline-offset-2 hover:underline",
      },
      size: {
        xs: "h-6 px-2 text-2xs [&_svg]:size-3",
        sm: "h-7 px-2.5 text-xs [&_svg]:size-3.5",
        default: "h-8 px-3 text-xs [&_svg]:size-4",
        lg: "h-9 px-3.5 text-[13px] [&_svg]:size-4",
        icon: "size-8 [&_svg]:size-4",
        "icon-sm": "size-7 [&_svg]:size-3.5",
        "icon-xs": "size-6 [&_svg]:size-3",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
