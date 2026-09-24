import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware class merge — the single join helper used across the UI. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
