import { describe, expect, it } from "vitest";
import { docToMarkup, draftColorOf, markupToDoc, withBaseColor, type DocNode } from "./markup-doc";
import { DRAFT_COLORS, parseDraftMarkup, renderDraftMarkup, splitDraftParagraphs, stripDraftMarkup } from "./draft-markup";

const roundTrip = (text: string) => docToMarkup(markupToDoc(text));

// ── markupToDoc ──────────────────────────────────────────────────────────

describe("markupToDoc", () => {
  it("one paragraph per blank-line-separated paragraph, hardBreak for a single newline", () => {
    expect(markupToDoc("Dear team,\n\nLine one\nLine two")).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Dear team," }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Line one" },
            { type: "hardBreak" },
            { type: "text", text: "Line two" },
          ],
        },
      ],
    });
  });

  it("marks: bold, italic, underline, highlight and the four colours as textStyle with the DRAFT_COLORS hex", () => {
    const [p] = markupToDoc("**b** {i}i{/i} __u__ ==h== {red}r{/red}{amber}a{/amber}{green}g{/green}{blue}x{/blue}").content;
    expect(p.content).toEqual([
      { type: "text", text: "b", marks: [{ type: "bold" }] },
      { type: "text", text: " " },
      { type: "text", text: "i", marks: [{ type: "italic" }] },
      { type: "text", text: " " },
      { type: "text", text: "u", marks: [{ type: "underline" }] },
      { type: "text", text: " " },
      { type: "text", text: "h", marks: [{ type: "highlight" }] },
      { type: "text", text: " " },
      { type: "text", text: "r", marks: [{ type: "textStyle", attrs: { color: DRAFT_COLORS.red } }] },
      { type: "text", text: "a", marks: [{ type: "textStyle", attrs: { color: DRAFT_COLORS.amber } }] },
      { type: "text", text: "g", marks: [{ type: "textStyle", attrs: { color: DRAFT_COLORS.green } }] },
      { type: "text", text: "x", marks: [{ type: "textStyle", attrs: { color: DRAFT_COLORS.blue } }] },
    ]);
  });

  it("nested markers stack their marks", () => {
    const [p] = markupToDoc("**bold ==both== bold**").content;
    expect(p.content).toEqual([
      { type: "text", text: "bold ", marks: [{ type: "bold" }] },
      { type: "text", text: "both", marks: [{ type: "bold" }, { type: "highlight" }] },
      { type: "text", text: " bold", marks: [{ type: "bold" }] },
    ]);
  });

  it("a styled span across a newline puts its marks on the hardBreak too", () => {
    const [p] = markupToDoc("{red}one\ntwo{/red}").content;
    const red = [{ type: "textStyle", attrs: { color: DRAFT_COLORS.red } }];
    expect(p.content).toEqual([
      { type: "text", text: "one", marks: red },
      { type: "hardBreak", marks: red },
      { type: "text", text: "two", marks: red },
    ]);
  });

  it("empty paragraphs have no content; an unpaired marker is literal text", () => {
    expect(markupToDoc("a\n\n\n\nb ** c").content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "a" }] },
      { type: "paragraph" },
      { type: "paragraph", content: [{ type: "text", text: "b ** c" }] },
    ]);
    expect(markupToDoc("").content).toEqual([{ type: "paragraph" }]);
  });

  it("a paragraph that starts with a newline (three in a row) starts with a hardBreak", () => {
    expect(markupToDoc("a\n\n\nb").content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "a" }] },
      { type: "paragraph", content: [{ type: "hardBreak" }, { type: "text", text: "b" }] },
    ]);
  });
});

// ── docToMarkup ──────────────────────────────────────────────────────────

const P = (...content: DocNode[]): DocNode => ({ type: "paragraph", content });
const T = (text: string, ...marks: DocNode["marks"][]): DocNode =>
  marks.length ? { type: "text", text, marks: marks.flat() as DocNode["marks"] } : { type: "text", text };
const BOLD = [{ type: "bold" }];
const ITALIC = [{ type: "italic" }];
const UNDER = [{ type: "underline" }];
const HIGH = [{ type: "highlight" }];
const color = (c: string) => [{ type: "textStyle", attrs: { color: c } }];
const doc = (...content: DocNode[]) => ({ type: "doc", content });

describe("docToMarkup", () => {
  it("emits the markers in a canonical nesting order whatever order the marks come in", () => {
    // ProseMirror sorts marks by schema rank, not by the markup's nesting.
    expect(docToMarkup(doc(P(T("x", HIGH, BOLD))))).toBe("**==x==**");
    expect(docToMarkup(doc(P(T("x", color(DRAFT_COLORS.red), UNDER, ITALIC, BOLD))))).toBe("**{i}__{red}x{/red}__{/i}**");
  });

  it("merges adjacent text with the same marks", () => {
    expect(docToMarkup(doc(P(T("a", BOLD), T("b", BOLD), T(" c"))))).toBe("**ab** c");
  });

  it("drops unknown marks and colours outside the four", () => {
    expect(docToMarkup(doc(P(T("s", [{ type: "strike" }]), T("l", [{ type: "link", attrs: { href: "x" } }]))))).toBe("sl");
    expect(docToMarkup(doc(P(T("p", color("#ff00ff")), T("n", [{ type: "textStyle", attrs: { color: null } }]))))).toBe("pn");
  });

  it("reads a colour in any case or as rgb()", () => {
    expect(docToMarkup(doc(P(T("a", color("#C0392B")), T("b", color("rgb(26, 95, 180)")))))).toBe("{red}a{/red}{blue}b{/blue}");
  });

  it("keeps a symmetric marker's edge whitespace outside it, so the pair stays valid", () => {
    // "**word **" would be literal asterisks in the mail.
    expect(docToMarkup(doc(P(T("word ", BOLD), T("next"))))).toBe("**word** next");
    expect(docToMarkup(doc(P(T(" ", HIGH), T("x"))))).toBe(" x");
    // {i} and the colour tags have no whitespace rule: kept as they are.
    expect(docToMarkup(doc(P(T(" a ", ITALIC))))).toBe("{i} a {/i}");
  });

  it("a hardBreak is a newline carrying its own marks", () => {
    expect(docToMarkup(doc(P(T("a", BOLD), { type: "hardBreak", marks: BOLD }, T("b", BOLD))))).toBe("**a\nb**");
    // Shift+Enter inside bold inserts an unmarked break: still bold either side.
    expect(docToMarkup(doc(P(T("a", BOLD), { type: "hardBreak" }, T("b", BOLD))))).toBe("**a**\n**b**");
  });

  it("an empty doc or empty paragraph is an empty string; blocks join with a blank line", () => {
    expect(docToMarkup({ type: "doc" })).toBe("");
    expect(docToMarkup(doc({ type: "paragraph" }))).toBe("");
    expect(docToMarkup(doc(P(T("a")), { type: "paragraph" }, P(T("b"))))).toBe("a\n\n\n\nb");
  });

  it("flattens any other block into paragraphs", () => {
    const list = { type: "bulletList", content: [{ type: "listItem", content: [P(T("one"))] }, { type: "listItem", content: [P(T("two"))] }] };
    expect(docToMarkup(doc(P(T("a")), list))).toBe("a\n\none\n\ntwo");
  });
});

// ── Round trip ───────────────────────────────────────────────────────────

describe("docToMarkup(markupToDoc(x)) === x", () => {
  it.each([
    ["no markers at all", "Dear team,\n\nPlease send the samples.\nThanks"],
    ["every marker", "**b** __u__ ==h== {i}i{/i} {red}r{/red} {amber}a{/amber} {green}g{/green} {blue}b{/blue}"],
    ["nested markers", "**bold ==both {i}three{/i}== bold** and __{red}red underline{/red}__"],
    ["markers across a line break", "**one\ntwo** {red}three\nfour{/red}"],
    ["empty paragraphs and odd newline runs", "a\n\n\n\nb\n\n\nc\n\n\n\n\n\nd"],
    ["leading and trailing blank lines", "\n\nbody\n\n"],
    ["a lone newline", "\n"],
    ["the empty body", ""],
    ["unpaired and invalid markers stay literal", "a ** b == c __ d {red} e {/i} f ** g**"],
    ["whitespace kept exactly", "  two  spaces\t tab  (2º pedido)  "],
    ["unicode", "Tóquio · Cooxupé — → • ==2.200 sacas=="],
    ["italic and colour on whitespace", "{i} {/i}{red} {/red}x"],
  ])("%s", (_name, text) => {
    expect(roundTrip(text)).toBe(text);
  });
});

describe("a non-canonical body keeps its meaning", () => {
  it.each([
    "==**x**==",
    "{red}**x**{/red}",
    "**a ==b** c==",
    "**{i} a{/i}**",
    "{i}**a**{/i}{i}**b**{/i}",
    "**a****b**",
  ])("%s renders the same HTML after a round trip", (text) => {
    expect(renderDraftMarkup(roundTrip(text))).toBe(renderDraftMarkup(text));
    // …and the canonical form is a fixed point.
    expect(roundTrip(roundTrip(text))).toBe(roundTrip(text));
  });

  it("holds for 1,000 random bodies whose markers all pair: same text, every visible character in the same style", () => {
    // Whitespace is exempt: "==**\n**==" highlights its line break only
    // because an EMPTY bold pair guards it, and the round trip moves the
    // break outside the highlight — which nobody can see.
    const visible = (markup: string) =>
      splitDraftParagraphs(markup).flatMap((p) =>
        parseDraftMarkup(p).flatMap((s) =>
          [...s.text].filter((ch) => /\S/.test(ch)).map((ch) => `${ch}:${+s.bold}${+s.italic}${+s.underline}${+s.highlight}${s.color ?? "-"}`),
        ),
      );
    // Bodies that leave a marker character as literal text are skipped: the
    // markup has no escape, so a stray "**" beside a real marker can pair
    // differently once whitespace moves — true of the textarea too.
    const literalMarker = /[*_=]|\{\/?(?:i|red|amber|green|blue)\}/;
    const tokens = ["**", "__", "==", "{i}", "{/i}", "{red}", "{/red}", "{blue}", "{/blue}", "ab", "c", " ", " ", "\n", "\n\n", "é"];
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    let checked = 0;
    for (let n = 0; n < 200_000 && checked < 1000; n++) {
      let text = "";
      const len = 1 + Math.floor(rand() * 24);
      for (let k = 0; k < len; k++) text += tokens[Math.floor(rand() * tokens.length)];
      if (literalMarker.test(stripDraftMarkup(text))) continue;
      checked += 1;
      const once = roundTrip(text);
      expect(stripDraftMarkup(once), JSON.stringify(text)).toBe(stripDraftMarkup(text));
      expect(visible(once), JSON.stringify(text)).toEqual(visible(text));
      expect(roundTrip(once), JSON.stringify(text)).toBe(once);
    }
    expect(checked).toBe(1000);
  });
});

describe("draftColorOf", () => {
  it("names the four colours from hex (any case), rgb() or name; null for anything else", () => {
    expect(draftColorOf(DRAFT_COLORS.green)).toBe("green");
    expect(draftColorOf("#B7791F")).toBe("amber");
    expect(draftColorOf("rgb(192, 57, 43)")).toBe("red");
    expect(draftColorOf("rgba(26,95,180,1)")).toBe("blue");
    expect(draftColorOf("red")).toBe("red");
    expect(draftColorOf("#000000")).toBeNull();
    expect(draftColorOf(null)).toBeNull();
    expect(draftColorOf(42)).toBeNull();
  });
});

describe("withBaseColor (spec 2026-10-15 X11)", () => {
  it("colours every uncoloured character, keeping every other mark and colour", () => {
    const src = "Please **except for DHL**.\n{blue}{i}Mark each box{/i}{/blue} ==ref==";
    const out = withBaseColor(src, "red");
    const segs = parseDraftMarkup(out);
    const at = (t: string) => segs.find((s) => s.text.includes(t))!;
    expect(at("Please").color).toBe("red");
    expect(at("except for DHL")).toMatchObject({ bold: true, color: "red" });
    expect(at("Mark each box")).toMatchObject({ italic: true, color: "blue" });
    expect(at("ref")).toMatchObject({ highlight: true, color: "red" });
    expect(stripDraftMarkup(out)).toBe(stripDraftMarkup(src));
  });

  it("plain text becomes one red span, its line breaks inside it", () => {
    expect(withBaseColor("a\nb", "red")).toBe("{red}a\nb{/red}");
  });
});
