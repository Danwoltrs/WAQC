import type { DraftColor } from "@/lib/email/draft-markup";

// Ported from sys src/app/(dashboard)/documents/draft-markup-preview.tsx:
// only the toolbar's shared button class, swatch classes and colour order.

export const BTN =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded border border-border bg-background text-foreground/80 hover:bg-accent disabled:opacity-40 sm:h-7 sm:w-7";

export const SWATCH_CLASS: Record<DraftColor, string> = {
  red: "bg-red-600",
  amber: "bg-amber-500",
  green: "bg-emerald-600",
  blue: "bg-blue-600",
};

export const COLOR_ORDER: DraftColor[] = ["red", "amber", "green", "blue"];
