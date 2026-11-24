import { describe, it, expect } from "vitest";
import {
  DRAFT_PARAGRAPH_STYLE,
  hasDraftMarkup,
  literalDraftText,
  parseDraftMarkup,
  renderDraftMarkup,
  stripDraftMarkup,
  wrapSelection,
} from "./draft-markup";

/** The routes' textToHtml as it stood on 2026-09-08 — the contract every
 *  unmarked body must still meet byte for byte. A literal copy on purpose:
 *  a change to the shared renderer's default output fails here before it
 *  reaches a counterparty's inbox. */
function legacyTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split("\n\n")
    .map(
      (para) =>
        `<p style="margin:0 0 12px 0;font-family:Calibri,Helvetica,sans-serif;font-size:11pt;color:#000000;">${para.replace(/\n/g, "<br/>")}</p>`,
    )
    .join("");
}

const P = `<p style="${DRAFT_PARAGRAPH_STYLE}">`;

describe("renderDraftMarkup", () => {
  it("renders a body with no markers byte-identically to the routes' textToHtml", () => {
    const bodies = [
      "",
      "Dear Filipp,\n\nPlease find attached the docs.\n\nBest,",
      "Line one\nLine two\n\nA & B <c> \"quoted\" it's",
      "StoneX Comercio e Exportacao de Commodities Ltda\nAvenida Selma Parada Bailarina, 505\nTel: +55 19 3515-2381\nCNPJ: 19.684.286/0001-08",
      "Trailing blank\n\n",
      "\n\nLeading blank",
      "a\n\n\nb",
      // Outlook's quoted-mail divider, a "=====" rule, "a == b", a starry line.
      "Dear all,\n\n________________________________\nFrom: X\n\n=====\na == b\n*****\nfile__name",
      "{red} without a closer, and {/blue} without an opener",
    ];
    for (const b of bodies) {
      expect(renderDraftMarkup(b)).toBe(legacyTextToHtml(b));
    }
  });

  it("renders each of the four styles with inline styles only", () => {
    expect(renderDraftMarkup("for **your review and approval**.")).toBe(
      `${P}for <strong>your review and approval</strong>.</p>`,
    );
    expect(renderDraftMarkup("__by Friday__")).toBe(`${P}<u>by Friday</u></p>`);
    // A span background, never <mark> — Outlook drops <mark>'s on some clients.
    expect(renderDraftMarkup("==urgent==")).toBe(
      `${P}<span style="background-color:#fff3a3;">urgent</span></p>`,
    );
    expect(
      renderDraftMarkup("{red}a{/red} {amber}b{/amber} {green}c{/green} {blue}d{/blue}"),
    ).toBe(
      `${P}<span style="color:#c0392b;">a</span> <span style="color:#b7791f;">b</span> <span style="color:#2e7d32;">c</span> <span style="color:#1a5fb4;">d</span></p>`,
    );
  });

  it("nests styles in either order", () => {
    expect(renderDraftMarkup("**{red}now{/red}**")).toBe(
      `${P}<strong><span style="color:#c0392b;">now</span></strong></p>`,
    );
    expect(renderDraftMarkup("{red}**now**{/red}")).toBe(
      `${P}<strong><span style="color:#c0392b;">now</span></strong></p>`,
    );
    expect(renderDraftMarkup("**bold __and under__ still bold**")).toBe(
      `${P}<strong>bold </strong><strong><u>and under</u></strong><strong> still bold</strong></p>`,
    );
  });

  it("escapes HTML inside a styled span", () => {
    expect(renderDraftMarkup("**a < b & c**")).toBe(
      `${P}<strong>a &lt; b &amp; c</strong></p>`,
    );
  });

  it("keeps a single newline inside a styled span as a line break", () => {
    expect(renderDraftMarkup("**Tel: 1\nCNPJ: 2**")).toBe(
      `${P}<strong>Tel: 1<br/>CNPJ: 2</strong></p>`,
    );
  });

  it("does not pair markers across paragraphs", () => {
    const body = "**open here\n\nclose here**";
    expect(renderDraftMarkup(body)).toBe(legacyTextToHtml(body));
  });

  it("renders unbalanced or empty markers literally", () => {
    for (const body of [
      "a ** b",
      "**",
      "****",
      "** **",
      "a ** b ** c",
      "{red}no close",
      "no open{/red}",
      "{red}{/red}",
      "{purple}x{/purple}",
    ]) {
      expect(renderDraftMarkup(body)).toBe(legacyTextToHtml(body));
    }
  });

  it("a second opener of the same style while open is a closer", () => {
    expect(renderDraftMarkup("**a**b**c**")).toBe(
      `${P}<strong>a</strong>b<strong>c</strong></p>`,
    );
  });

  it("a colour cannot open inside another colour; the tags stay literal", () => {
    expect(renderDraftMarkup("{red}a{blue}b{/blue}{/red}")).toBe(
      `${P}<span style="color:#c0392b;">a{blue}b{/blue}</span></p>`,
    );
  });

  it("renders a valid pair after a literal marker", () => {
    // The first ** has no valid partner (space after it); the later pair does.
    expect(renderDraftMarkup("a ** b **c** d")).toBe(
      `${P}a ** b <strong>c</strong> d</p>`,
    );
  });
});

describe("parseDraftMarkup", () => {
  it("returns flagged segments", () => {
    expect(parseDraftMarkup("x **y** z")).toEqual([
      { text: "x ", bold: false, underline: false, highlight: false, italic: false, color: null },
      { text: "y", bold: true, underline: false, highlight: false, italic: false, color: null },
      { text: " z", bold: false, underline: false, highlight: false, italic: false, color: null },
    ]);
  });
  it("merges adjacent segments with the same style", () => {
    expect(parseDraftMarkup("plain {red}x{/red}{red}y{/red} plain")).toEqual([
      { text: "plain ", bold: false, underline: false, highlight: false, italic: false, color: null },
      { text: "xy", bold: false, underline: false, highlight: false, italic: false, color: "red" },
      { text: " plain", bold: false, underline: false, highlight: false, italic: false, color: null },
    ]);
  });
  it("an empty paragraph has no segments", () => {
    expect(parseDraftMarkup("")).toEqual([]);
  });
});

describe("stripDraftMarkup / hasDraftMarkup", () => {
  it("removes paired markers and keeps unpaired ones", () => {
    const body = "Hi,\n\n**Please confirm** by {red}Friday{/red}.\n\n____\n** stray";
    expect(stripDraftMarkup(body)).toBe("Hi,\n\nPlease confirm by Friday.\n\n____\n** stray");
    expect(hasDraftMarkup(body)).toBe(true);
  });
  it("reports whether anything would render", () => {
    expect(hasDraftMarkup("**x**")).toBe(true);
    expect(hasDraftMarkup("____ and ** stray")).toBe(false);
    expect(hasDraftMarkup("")).toBe(false);
  });
});

describe("wrapSelection", () => {
  const t = "Please confirm by Friday.";
  it("wraps the selection and keeps it selected inside the markers", () => {
    const r = wrapSelection(t, 7, 14, "bold");
    expect(r.text).toBe("Please **confirm** by Friday.");
    expect(t.slice(7, 14)).toBe("confirm");
    expect(r.text.slice(r.selectionStart, r.selectionEnd)).toBe("confirm");
  });
  it("grows a collapsed selection to the word under the caret", () => {
    const r = wrapSelection(t, 9, 9, "underline");
    expect(r.text).toBe("Please __confirm__ by Friday.");
  });
  it("leaves edge whitespace outside the markers", () => {
    const r = wrapSelection(t, 6, 15, "highlight");
    expect(r.text).toBe("Please ==confirm== by Friday.");
  });
  it("unwraps when the selection already carries the markers, inside or outside", () => {
    const wrapped = "Please **confirm** by Friday.";
    expect(wrapSelection(wrapped, 7, 18, "bold").text).toBe(t);
    expect(wrapSelection(wrapped, 9, 16, "bold").text).toBe(t);
    const red = "Please {red}confirm{/red} by Friday.";
    expect(wrapSelection(red, 7, 25, "red").text).toBe(t);
  });
  it("wraps a colour with its named tags", () => {
    expect(wrapSelection(t, 18, 24, "red").text).toBe(
      "Please confirm by {red}Friday{/red}.",
    );
  });
  it("tolerates a reversed selection", () => {
    expect(wrapSelection(t, 24, 18, "bold").text).toBe("Please confirm by **Friday**.");
  });
  it("does nothing on whitespace or an empty body", () => {
    expect(wrapSelection("a  b", 1, 3, "bold").text).toBe("a  b");
    expect(wrapSelection("", 0, 0, "bold").text).toBe("");
  });
});

describe("italic {i}…{/i}", () => {
  it("renders <em>, wraps <u>, inside <strong>", () => {
    expect(renderDraftMarkup("a {i}b{/i} c")).toBe(
      `<p style="${DRAFT_PARAGRAPH_STYLE}">a <em>b</em> c</p>`,
    );
    expect(renderDraftMarkup("**{i}b{/i}**")).toContain("<strong><em>b</em></strong>");
    expect(renderDraftMarkup("__{i}b{/i}__")).toContain("<em><u>b</u></em>");
  });
  it("an unpaired marker stays literal", () => {
    expect(renderDraftMarkup("a {i}b")).toBe(`<p style="${DRAFT_PARAGRAPH_STYLE}">a {i}b</p>`);
    expect(renderDraftMarkup("a {/i}b")).toBe(`<p style="${DRAFT_PARAGRAPH_STYLE}">a {/i}b</p>`);
  });
  it("pairs within a paragraph only", () => {
    expect(renderDraftMarkup("{i}a\n\nb{/i}")).not.toContain("<em>");
  });
  it("is detected and stripped", () => {
    expect(hasDraftMarkup("x {i}y{/i}")).toBe(true);
    expect(stripDraftMarkup("x {i}y{/i}")).toBe("x y");
  });
  it("coexists with colour tags", () => {
    expect(renderDraftMarkup("{red}{i}z{/i}{/red}")).toContain("<span");
    expect(renderDraftMarkup("{red}{i}z{/i}{/red}")).toContain("<em><span");
  });
  it("wrapSelection wraps and unwraps", () => {
    const r = wrapSelection("hello world", 0, 5, "italic");
    expect(r.text).toBe("{i}hello{/i} world");
    expect(wrapSelection(r.text, r.selectionStart, r.selectionEnd, "italic").text).toBe("hello world");
  });
});

// Saved free text dropped INTO markup (sample request v2, final review M5):
// the markup has no escape, so each marker gets an invisible word joiner.
describe("literalDraftText", () => {
  const shown = (s: string) => s.replace(/\u2060/g, "");
  const plain = (s: string) => parseDraftMarkup(s).every((g) => !g.bold && !g.underline && !g.highlight && !g.italic && g.color === null);

  it("text without markers comes back unchanged", () => {
    for (const t of ["FedEx or DHL only.", "Room 2301, SWFC", "+81-80-7722", "a * b _ c = d {x}", ""]) {
      expect(literalDraftText(t)).toBe(t);
    }
  });

  it("every marker reads as the characters it shows", () => {
    for (const t of ["**x**", "__x__", "==x==", "{i}x{/i}", "{red}x{/red}", "{blue}x{/blue}", "a ***b*** c", "====", "x{/amber}"]) {
      const lit = literalDraftText(t);
      expect(shown(lit), t).toBe(t);
      expect(plain(lit), t).toBe(true);
      expect(shown(stripDraftMarkup(lit)), t).toBe(t);
    }
  });

  it("inside a red span it stays red and literal — a typed {/red} does not end it", () => {
    const html = renderDraftMarkup(`{red}${literalDraftText("Mark **FRAGILE** {/red}now")}{/red}`);
    expect(shown(html)).toContain(">Mark **FRAGILE** {/red}now</span>");
    expect(html).not.toContain("<strong>");
  });

  it("is idempotent", () => {
    const once = literalDraftText("**x** {red}y{/red} __z__");
    expect(literalDraftText(once)).toBe(once);
  });
});
