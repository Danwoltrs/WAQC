import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftMarkup } from "./draft-markup-view";

describe("DraftMarkup (React view)", () => {
  it("renders {i} as <em>, matching the HTML renderer's nesting", () => {
    expect(renderToStaticMarkup(<DraftMarkup text="a {i}b{/i} c" />)).toBe("a <em>b</em> c");
    expect(renderToStaticMarkup(<DraftMarkup text="**{i}b{/i}**" />)).toBe(
      "<strong><em>b</em></strong>",
    );
    expect(renderToStaticMarkup(<DraftMarkup text="__{i}b{/i}__" />)).toBe(
      "<em><u>b</u></em>",
    );
  });
});

describe("DraftMarkup baseColor (spec 2026-10-15 X11)", () => {
  it("uncoloured text takes the base colour; a coloured span keeps its own", () => {
    expect(renderToStaticMarkup(<DraftMarkup text="a {blue}b{/blue}" baseColor="red" />)).toBe(
      '<span class="text-red-600 dark:text-red-400">a <span class="text-blue-700 dark:text-blue-300">b</span></span>',
    );
  });

  it("without a base colour nothing changes", () => {
    expect(renderToStaticMarkup(<DraftMarkup text="a **b**" />)).toBe("a <strong>b</strong>");
  });

  // The mail paints highlighted, uncoloured text in the base colour
  // (withBaseColor); the screen must not show it charcoal (no black, X11).
  const RED_MARK = '<mark class="rounded bg-amber-300/70 px-0.5 text-red-600 dark:text-red-400 dark:bg-amber-500/50">';
  const BLUE_MARK = '<mark class="rounded bg-amber-300/70 px-0.5 text-blue-700 dark:text-blue-300 dark:bg-amber-500/50">';
  const CHARCOAL_MARK = '<mark class="rounded bg-amber-300/70 px-0.5 text-foreground dark:bg-amber-500/50">';

  it("highlighted text with no colour takes the base colour, not text-foreground", () => {
    expect(renderToStaticMarkup(<DraftMarkup text="a ==b== **==c==**" baseColor="red" />)).toBe(
      `<span class="text-red-600 dark:text-red-400">a ${RED_MARK}b</mark> ${RED_MARK}<strong>c</strong></mark></span>`,
    );
  });

  it("highlighted text with a colour keeps its colour on a base-coloured surface", () => {
    expect(renderToStaticMarkup(<DraftMarkup text="{blue}==b=={/blue}" baseColor="red" />)).toBe(
      `<span class="text-red-600 dark:text-red-400"><span class="text-blue-700 dark:text-blue-300">${BLUE_MARK}b</mark></span></span>`,
    );
  });

  it("without a base colour a highlight is charcoal as before, coloured or not", () => {
    expect(renderToStaticMarkup(<DraftMarkup text="a ==b== {blue}==c=={/blue}" />)).toBe(
      `a ${CHARCOAL_MARK}b</mark> <span class="text-blue-700 dark:text-blue-300">${CHARCOAL_MARK}c</mark></span>`,
    );
  });
});
