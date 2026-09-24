"use client";

import { cn } from "@/lib/utils";

/**
 * The single dark surface in the application.
 *
 * Rationale, stated once: the brief asks for a deep-slate / civic-navy palette
 * with a *light* enterprise canvas. Those pull in opposite directions unless the
 * dark tones are confined. So Deep Slate (#0F172A) appears exactly once — as a
 * flat, solid context band under the topbar that tells the officer which desk
 * they are sitting at — and the rest of the application is neutral grey with
 * white containers.
 *
 * It is a flat fill, not a gradient. No glow, no blur, no accent stripe.
 */
export const heroBandClasses = cn(
  "flex flex-col items-start justify-between gap-x-4 gap-y-3 rounded-lg lg:flex-row lg:items-center",
  "border border-ink bg-ink px-4 py-3.5",
);
