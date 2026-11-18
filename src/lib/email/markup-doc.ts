/**
 * Draft markup ⇄ editor document — the bridge behind the WYSIWYG request
 * body editor (spec 2026-10-14 D11, §7).
 *
 * The stored body stays TEXT in the draft markup of `draft-markup.ts`
 * (`**bold**`, `__underline__`, `==highlight==`, `{i}…{/i}`, `{red}…{/red}`
 * and amber / green / blue). The editor works on a ProseMirror document;
 * these two functions translate, so the compose's state, its template
 * rebuilds, "Put it back" and the send all keep reading and writing text.
 *
 *  - `markupToDoc`: one `paragraph` per blank-line-separated paragraph
 *    (`splitDraftParagraphs`), a `hardBreak` per single newline, text with
 *    the marks `parseDraftMarkup` found — `textStyle{color}` carries the
 *    DRAFT_COLORS hex. No second parser: what the mail renders is what the
 *    editor shows.
 *  - `docToMarkup`: the inverse. Marks open in ONE canonical order (the
 *    nesting `renderDraftMarkup` emits: bold › italic › underline › colour ›
 *    highlight), adjacent text with the same marks merges, marks the markup
 *    cannot say (strike, link, a colour outside the four) are dropped. A
 *    template body comes back byte-identical, and any body whose markers
 *    all pair keeps its text and every visible character's style (both
 *    round-trip tested). The one blind spot is the markup's own: it has no
 *    escape, so a stray literal `**` typed against a real marker can pair
 *    differently once a marker's edge whitespace moves.
 *
 * Pure: no TipTap import. The JSON is the shape `editor.getJSON()` returns
 * and `setContent` accepts.
 */

import {
  DRAFT_COLORS,
  parseDraftMarkup,
  splitDraftParagraphs,
  type DraftColor,
  type DraftSegment,
} from "./draft-markup";

export type DocMark = { type: string; attrs?: Record<string, unknown> };

export type DocNode = {
  type: string;
  text?: string;
  marks?: DocMark[];
  content?: DocNode[];
  attrs?: Record<string, unknown>;
};

export type MarkupDoc = { type: "doc"; content: DocNode[] };

/** What docToMarkup reads — the editor's `getJSON()` fits it. */
export type DocLike = {
  type?: string;
  text?: string;
  marks?: ReadonlyArray<{ type: string; attrs?: Record<string, unknown> | null }>;
  content?: ReadonlyArray<DocLike>;
};

type Style = Omit<DraftSegment, "text">;

const COLOR_NAMES = Object.keys(DRAFT_COLORS) as DraftColor[];

/**
 * The draft colour a mark's `color` attribute stands for — its DRAFT_COLORS
 * hex in any case, the `rgb()` a browser normalises a pasted style to, or
 * the colour's own name. Anything else is null: the markup has four
 * colours and no other.
 */
export function draftColorOf(value: unknown): DraftColor | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  const hex = rgb
    ? `#${rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`
    : v;
  return COLOR_NAMES.find((c) => c === v || DRAFT_COLORS[c] === hex) ?? null;
}

// ── markup → doc ─────────────────────────────────────────────────────────

/** The segment's marks, in the canonical order (the JSON order is
 *  cosmetic: ProseMirror re-sorts marks by schema rank). */
function marksOf(style: Style): DocMark[] {
  const marks: DocMark[] = [];
  if (style.bold) marks.push({ type: "bold" });
  if (style.italic) marks.push({ type: "italic" });
  if (style.underline) marks.push({ type: "underline" });
  if (style.color) marks.push({ type: "textStyle", attrs: { color: DRAFT_COLORS[style.color] } });
  if (style.highlight) marks.push({ type: "highlight" });
  return marks;
}

function withMarks(node: DocNode, style: Style): DocNode {
  const marks = marksOf(style);
  return marks.length > 0 ? { ...node, marks } : node;
}

function paragraphOf(paragraph: string): DocNode {
  const content: DocNode[] = [];
  for (const seg of parseDraftMarkup(paragraph)) {
    // A newline inside a styled span keeps the span's marks, so
    // "{red}a\nb{/red}" comes back as one span, not two.
    seg.text.split("\n").forEach((piece, i) => {
      if (i > 0) content.push(withMarks({ type: "hardBreak" }, seg));
      if (piece) content.push(withMarks({ type: "text", text: piece }, seg));
    });
  }
  return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
}

/** The draft markup as an editor document. */
export function markupToDoc(text: string): MarkupDoc {
  return { type: "doc", content: splitDraftParagraphs(text).map(paragraphOf) };
}

// ── doc → markup ─────────────────────────────────────────────────────────

/** Text with one style: a hardBreak is a "\n" carrying its own marks. */
interface Run {
  text: string;
  style: Style;
}

type Key = "bold" | "italic" | "underline" | "color" | "highlight";

/** Outermost first — the nesting renderDraftMarkup's HTML has. */
const ORDER: readonly Key[] = ["bold", "italic", "underline", "color", "highlight"];

/** `**`, `__` and `==` pair only around content that neither starts nor
 *  ends with whitespace; `{i}` and the colour tags have no such rule. */
const SYMMETRIC: Partial<Record<Key, string>> = { bold: "**", underline: "__", highlight: "==" };

function styleOf(marks: DocLike["marks"]): Style {
  const style: Style = { bold: false, underline: false, highlight: false, italic: false, color: null };
  for (const mark of marks ?? []) {
    if (mark.type === "bold") style.bold = true;
    else if (mark.type === "italic") style.italic = true;
    else if (mark.type === "underline") style.underline = true;
    else if (mark.type === "highlight") style.highlight = true;
    else if (mark.type === "textStyle") style.color = draftColorOf(mark.attrs?.color) ?? style.color;
    // Anything else (strike, link, code …) has no markup: dropped.
  }
  return style;
}

function sameStyle(a: Style, b: Style): boolean {
  return (
    a.bold === b.bold &&
    a.underline === b.underline &&
    a.highlight === b.highlight &&
    a.italic === b.italic &&
    a.color === b.color
  );
}

function pushRun(runs: Run[], text: string, style: Style): void {
  if (!text) return;
  const last = runs[runs.length - 1];
  if (last && sameStyle(last.style, style)) last.text += text;
  else runs.push({ text, style });
}

function runsOf(block: DocLike): Run[] {
  const runs: Run[] = [];
  for (const node of block.content ?? []) {
    pushRun(runs, node.type === "hardBreak" ? "\n" : (node.text ?? ""), styleOf(node.marks));
  }
  return runs;
}

/** A node holding inline content (or nothing) is one paragraph; any other
 *  block (a list, a quote) is flattened into the paragraphs it holds. */
function textblocks(node: DocLike): DocLike[] {
  const kids = node.content ?? [];
  if (kids.length === 0 || kids.some((k) => k.type === "text" || k.type === "hardBreak" || k.text !== undefined)) {
    return [node];
  }
  return kids.flatMap(textblocks);
}

/** One marker pair to emit: [from, to) over the piece's text. */
interface Span {
  key: Key;
  color: DraftColor | null;
  from: number;
  to: number;
}

function valueAt(style: Style, key: Key): string | null {
  if (key === "color") return style.color;
  return style[key] ? key : null;
}

/** Each style's maximal stretches. With `trim`, a symmetric marker's edge
 *  whitespace is moved outside it ("**word **" would be literal asterisks
 *  in the mail) and an all-whitespace stretch is dropped. */
function spansOf(runs: Run[], trim: boolean): Span[] {
  const text = runs.map((r) => r.text).join("");
  const spans: Span[] = [];
  const finish = (s: Span) => {
    if (trim && SYMMETRIC[s.key]) {
      while (s.from < s.to && /\s/.test(text[s.from])) s.from += 1;
      while (s.to > s.from && /\s/.test(text[s.to - 1])) s.to -= 1;
    }
    if (s.to > s.from) spans.push(s);
  };
  for (const key of ORDER) {
    let pos = 0;
    let open: Span | null = null;
    for (const run of runs) {
      const value = valueAt(run.style, key);
      // red → blue is two spans: the colour's value is part of the span.
      if (open && (value === null || (key === "color" && open.color !== value))) {
        finish(open);
        open = null;
      }
      if (!open && value !== null) {
        open = { key, color: key === "color" ? (value as DraftColor) : null, from: pos, to: pos };
      }
      pos += run.text.length;
      if (open) open.to = pos;
    }
    if (open) finish(open);
  }
  return spans;
}

function opener(s: Span): string {
  if (s.key === "italic") return "{i}";
  if (s.key === "color") return `{${s.color}}`;
  return SYMMETRIC[s.key]!;
}

function closer(s: Span): string {
  if (s.key === "italic") return "{/i}";
  if (s.key === "color") return `{/${s.color}}`;
  return SYMMETRIC[s.key]!;
}

/** The text with its markers: at each position, the spans ending there
 *  close innermost first, then the spans starting there open outermost
 *  first — so a nested body nests, and an overlap closes where it ends
 *  (the parser pairs by kind, not by nesting). */
function emit(text: string, spans: Span[]): string {
  const rank = (s: Span) => ORDER.indexOf(s.key);
  const stack: Span[] = [];
  let out = "";
  for (let i = 0; i <= text.length; i++) {
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].to === i) {
        out += closer(stack[k]);
        stack.splice(k, 1);
      }
    }
    for (const s of spans.filter((x) => x.from === i).sort((a, b) => rank(a) - rank(b))) {
      out += opener(s);
      stack.push(s);
    }
    if (i < text.length) out += text[i];
  }
  return out;
}

/** True when the markup parses back to exactly these runs. */
function parsesTo(markup: string, runs: Run[]): boolean {
  const segs = parseDraftMarkup(markup);
  return segs.length === runs.length && segs.every((s, i) => s.text === runs[i].text && sameStyle(s, runs[i].style));
}

/** One stretch of runs with no blank line in it. Emitted as it stands when
 *  that parses back exactly (a "**{i} a{/i}**" body keeps its bold space);
 *  otherwise with the symmetric markers' edge whitespace moved out. */
function pieceMarkup(runs: Run[]): string {
  const text = runs.map((r) => r.text).join("");
  const exact = emit(text, spansOf(runs, false));
  return parsesTo(exact, runs) ? exact : emit(text, spansOf(runs, true));
}

/** The runs of [from, to) of their joined text. */
function sliceRuns(runs: Run[], from: number, to: number): Run[] {
  const out: Run[] = [];
  let pos = 0;
  for (const run of runs) {
    const end = pos + run.text.length;
    const a = Math.max(from, pos);
    const b = Math.min(to, end);
    if (a < b) out.push({ text: run.text.slice(a - pos, b - pos), style: run.style });
    pos = end;
  }
  return out;
}

/**
 * A paragraph's markup. "\n\n" is the paragraph separator, so two hard
 * breaks in a row with no marker between them WILL read back as a
 * paragraph break: the paragraph is cut there, left to right as
 * splitDraftParagraphs cuts, and each piece is emitted on its own — a
 * marker pair never straddles a cut. Two breaks a marker separates
 * ("\n{blue}\n") stay breaks. Should a piece still come out with a blank
 * line in it (edge whitespace moved out of a marker), every "\n\n" is cut
 * instead: a break may turn into a paragraph, a marker never into text.
 */
function paragraphMarkup(block: DocLike): string {
  const runs = runsOf(block);
  const styles = runs.flatMap((r) => Array.from({ length: r.text.length }, () => r.style));
  const text = runs.map((r) => r.text).join("");
  const cut = (everyBlankLine: boolean): string[] => {
    const pieces: string[] = [];
    let start = 0;
    for (let i = 0; i + 1 < text.length; i++) {
      if (text[i] !== "\n" || text[i + 1] !== "\n") continue;
      if (!everyBlankLine && !sameStyle(styles[i], styles[i + 1])) continue;
      pieces.push(pieceMarkup(sliceRuns(runs, start, i)));
      start = i + 2;
      i += 1;
    }
    pieces.push(pieceMarkup(sliceRuns(runs, start, text.length)));
    return pieces;
  };
  const pieces = cut(false);
  return (pieces.some((p) => p.includes("\n\n")) ? cut(true) : pieces).join("\n\n");
}

/** The editor document as draft markup. */
export function docToMarkup(doc: DocLike): string {
  return textblocks(doc).map(paragraphMarkup).join("\n\n");
}

// ── Base colour (spec 2026-10-15 X11) ───────────────────────────────────

/**
 * The markup with every character that has no colour given `color` — the
 * courier instructions' red. Colours do not nest in the markup
 * (parseDraftMarkup opens one only when none is open), so wrapping the
 * whole text in `{red}` would drop the inner colours; this rebuilds the
 * markup through the document instead. Line breaks take the colour too, so
 * a red span runs across them unbroken.
 */
export function withBaseColor(text: string, color: DraftColor): string {
  const hex = DRAFT_COLORS[color];
  const paint = (node: DocNode): DocNode => {
    if (node.type === "text" || node.type === "hardBreak") {
      const marks = node.marks ?? [];
      if (marks.some((m) => m.type === "textStyle" && draftColorOf(m.attrs?.color))) return node;
      return { ...node, marks: [...marks, { type: "textStyle", attrs: { color: hex } }] };
    }
    return node.content ? { ...node, content: node.content.map(paint) } : node;
  };
  const doc = markupToDoc(text);
  return docToMarkup({ ...doc, content: doc.content.map(paint) });
}
