/**
 * Draft body markup — the ONE representation of emphasis in an outbound
 * draft, and the ONE renderer every send route uses.
 *
 * The draft body stays plain text in `ai_drafts_log.body_text` and in the
 * card's textarea. Emphasis is written INLINE with four markers:
 *
 *   **bold**   __underline__   ==highlight==   {i}italic{/i}   {red}colour{/red}
 *
 * (colours: red, amber, green, blue). Nothing else — no sizes, no lists,
 * no links. Templates and the forward prompt emit `**…**` around the one
 * clause that says what the recipient must do; the toolbar on the draft
 * card wraps a selection in the same markers; and the two readers (the
 * inbox's draft panes and the card's preview) render the same segments
 * `renderDraftMarkup` turns into HTML. What the panel shows is what leaves.
 *
 * Rendering rules:
 *  - A body with NO markers renders byte-identically to the `textToHtml`
 *    the five send routes carried before 2026-09-08 (escape `& < >`, split
 *    paragraphs on a blank line, `<br/>` for a single newline, one
 *    `<p style="…Calibri 11pt #000">` per paragraph). That string is the
 *    contract — `DRAFT_PARAGRAPH_STYLE` is what every counterparty sees.
 *  - Markers pair within a paragraph; a marker without its partner is
 *    literal text. `**` needs non-empty content that does not start or
 *    end with a space, so a stray `**` in prose stays a `**`.
 *  - Inline styles only. Outlook ignores classes and drops `<mark>`'s
 *    background on some clients, so highlight is a `<span>` with
 *    `background-color`.
 *
 * See docs/superpowers/handoffs/2026-09-08-draft-body-formatting-handoff.md.
 */

export type DraftColor = "red" | "amber" | "green" | "blue";

export interface DraftSegment {
  text: string;
  bold: boolean;
  underline: boolean;
  highlight: boolean;
  italic: boolean;
  color: DraftColor | null;
}

export type DraftStyle = "bold" | "underline" | "highlight" | "italic" | DraftColor;

/** Verbatim from the routes' textToHtml (2026-09-08). Do not touch the
 *  font: a change here is visible to every counterparty at once. */
export const DRAFT_PARAGRAPH_STYLE =
  "margin:0 0 12px 0;font-family:Calibri,Helvetica,sans-serif;font-size:11pt;color:#000000;";

export const DRAFT_HIGHLIGHT_COLOR = "#fff3a3";

export const DRAFT_COLORS: Readonly<Record<DraftColor, string>> = {
  red: "#c0392b",
  amber: "#b7791f",
  green: "#2e7d32",
  blue: "#1a5fb4",
};

const COLOR_NAMES: readonly DraftColor[] = ["red", "amber", "green", "blue"];

const SYMMETRIC: ReadonlyArray<{
  marker: string;
  style: "bold" | "underline" | "highlight";
}> = [
  { marker: "**", style: "bold" },
  { marker: "__", style: "underline" },
  { marker: "==", style: "highlight" },
];

function isColor(s: string): s is DraftColor {
  return (COLOR_NAMES as readonly string[]).includes(s);
}

/** Content between a symmetric pair must be non-empty and must not start
 *  or end with whitespace — `** **` and `a ** b ** c` are prose. */
function validSpan(text: string, from: number, to: number): boolean {
  if (to <= from) return false;
  return !/^\s/.test(text[from]) && !/\s$/.test(text[to - 1]);
}

/**
 * Parse ONE paragraph into styled segments. Markers pair left to right:
 * an opening marker is only an opening marker when its partner exists
 * later in the paragraph; otherwise it is text. Newlines inside the
 * paragraph are kept in the segment text.
 */
export function parseDraftMarkup(paragraph: string): DraftSegment[] {
  const out: DraftSegment[] = [];
  const state = {
    bold: false,
    underline: false,
    highlight: false,
    italic: false,
    color: null as DraftColor | null,
  };
  let buf = "";
  const flush = () => {
    if (!buf) return;
    const last = out[out.length - 1];
    if (
      last &&
      last.bold === state.bold &&
      last.underline === state.underline &&
      last.highlight === state.highlight &&
      last.italic === state.italic &&
      last.color === state.color
    ) {
      last.text += buf;
    } else {
      out.push({ text: buf, ...state });
    }
    buf = "";
  };

  let i = 0;
  const n = paragraph.length;
  while (i < n) {
    let consumed = false;

    for (const { marker, style } of SYMMETRIC) {
      if (!paragraph.startsWith(marker, i)) continue;
      if (state[style]) {
        // Closing.
        flush();
        state[style] = false;
        i += marker.length;
        consumed = true;
        break;
      }
      const close = paragraph.indexOf(marker, i + marker.length);
      if (close !== -1 && validSpan(paragraph, i + marker.length, close)) {
        flush();
        state[style] = true;
        i += marker.length;
        consumed = true;
        break;
      }
      // No partner: literal. Fall through to the char append below.
    }
    if (consumed) continue;

    if (paragraph[i] === "{") {
      const m = /^\{(\/?)([a-z]+)\}/.exec(paragraph.slice(i, i + 12));
      if (m && m[2] === "i") {
        if (m[1] === "/") {
          if (state.italic) {
            flush();
            state.italic = false;
            i += m[0].length;
            continue;
          }
        } else if (!state.italic) {
          const close = paragraph.indexOf("{/i}", i + m[0].length);
          if (close !== -1 && close > i + m[0].length) {
            flush();
            state.italic = true;
            i += m[0].length;
            continue;
          }
        }
      }
      if (m && isColor(m[2])) {
        const closing = m[1] === "/";
        const name = m[2];
        if (closing) {
          if (state.color === name) {
            flush();
            state.color = null;
            i += m[0].length;
            continue;
          }
        } else if (state.color === null) {
          const closeTag = `{/${name}}`;
          const close = paragraph.indexOf(closeTag, i + m[0].length);
          if (close !== -1 && close > i + m[0].length) {
            flush();
            state.color = name;
            i += m[0].length;
            continue;
          }
        }
      }
    }

    buf += paragraph[i];
    i += 1;
  }
  flush();
  return out;
}

/** Split a body into paragraphs exactly as the routes always did. */
export function splitDraftParagraphs(text: string): string[] {
  return text.split("\n\n");
}

/** True when the body carries at least one rendered (paired) marker. */
export function hasDraftMarkup(text: string): boolean {
  return splitDraftParagraphs(text).some((p) =>
    parseDraftMarkup(p).some(
      (s) =>
        s.bold || s.underline || s.highlight || s.italic || s.color !== null,
    ),
  );
}

/** The body with every paired marker removed. Unpaired markers stay —
 *  they were prose to the renderer too. */
export function stripDraftMarkup(text: string): string {
  return splitDraftParagraphs(text)
    .map((p) =>
      parseDraftMarkup(p)
        .map((s) => s.text)
        .join(""),
    )
    .join("\n\n");
}

/** U+2060 WORD JOINER: invisible, and no line-break opportunity. */
const MARKER_BREAK = "\u2060";

/**
 * Text someone typed into a field — a saved courier instruction, address,
 * ATTN, phone, a destination's name — made safe to drop INTO markup. The
 * markup has no escape, so a `**` (or `__`, `==`, `{i}`, `{red}` …) in it
 * would pair with a marker around it or on another line of the paragraph
 * and turn into formatting, or a `{/red}` would end the red early. Every
 * such marker gets an invisible word joiner inside it: the renderer, the
 * editor and stripDraftMarkup then all read the characters it shows, and
 * the mail prints them as typed. Text without markers comes back unchanged
 * (a template stays byte-identical); applying it twice changes nothing.
 */
export function literalDraftText(text: string): string {
  return text
    .replace(/([*_=])(?=\1)/g, `$1${MARKER_BREAK}`)
    .replace(/\{(?=\/?(?:i|red|amber|green|blue)\})/g, `{${MARKER_BREAK}`);
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function segmentHtml(seg: DraftSegment): string {
  let html = escapeText(seg.text).replace(/\n/g, "<br/>");
  if (seg.highlight) {
    html = `<span style="background-color:${DRAFT_HIGHLIGHT_COLOR};">${html}</span>`;
  }
  if (seg.color) {
    html = `<span style="color:${DRAFT_COLORS[seg.color]};">${html}</span>`;
  }
  if (seg.underline) html = `<u>${html}</u>`;
  if (seg.italic) html = `<em>${html}</em>`;
  if (seg.bold) html = `<strong>${html}</strong>`;
  return html;
}

/**
 * The HTML the send routes put in the mail. One `<p>` per paragraph in
 * the routes' exact style; markers become inline-styled elements. A body
 * without markers renders byte-identically to the pre-2026-09-08
 * `textToHtml`.
 */
export function renderDraftMarkup(text: string): string {
  return splitDraftParagraphs(text)
    .map(
      (para) =>
        `<p style="${DRAFT_PARAGRAPH_STYLE}">${parseDraftMarkup(para).map(segmentHtml).join("")}</p>`,
    )
    .join("");
}

function markersFor(style: DraftStyle): [string, string] {
  switch (style) {
    case "bold":
      return ["**", "**"];
    case "underline":
      return ["__", "__"];
    case "highlight":
      return ["==", "=="];
    case "italic":
      return ["{i}", "{/i}"];
    default:
      return [`{${style}}`, `{/${style}}`];
  }
}

export interface WrapResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * The toolbar's edit: wrap the selection in a style's markers, or unwrap
 * it when it is already wrapped (markers just inside or just outside the
 * selection). A collapsed selection grows to the word under the caret;
 * whitespace at the selection's edges stays outside the markers. When
 * there is nothing to wrap the text comes back unchanged.
 */
export function wrapSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  style: DraftStyle,
): WrapResult {
  const [open, close] = markersFor(style);
  let start = Math.max(0, Math.min(selectionStart, selectionEnd));
  let end = Math.min(text.length, Math.max(selectionStart, selectionEnd));

  if (start === end) {
    while (start > 0 && /\S/.test(text[start - 1])) start -= 1;
    while (end < text.length && /\S/.test(text[end])) end += 1;
  }
  while (start < end && /\s/.test(text[start])) start += 1;
  while (end > start && /\s/.test(text[end - 1])) end -= 1;
  if (start === end) return { text, selectionStart, selectionEnd };

  const inner = text.slice(start, end);
  // Markers inside the selection: `**word**` selected whole.
  if (
    inner.length > open.length + close.length &&
    inner.startsWith(open) &&
    inner.endsWith(close)
  ) {
    const bare = inner.slice(open.length, inner.length - close.length);
    return {
      text: text.slice(0, start) + bare + text.slice(end),
      selectionStart: start,
      selectionEnd: start + bare.length,
    };
  }
  // Markers just outside the selection: `word` selected inside `**word**`.
  if (
    text.slice(start - open.length, start) === open &&
    text.slice(end, end + close.length) === close
  ) {
    return {
      text: text.slice(0, start - open.length) + inner + text.slice(end + close.length),
      selectionStart: start - open.length,
      selectionEnd: start - open.length + inner.length,
    };
  }
  return {
    text: text.slice(0, start) + open + inner + close + text.slice(end),
    selectionStart: start + open.length,
    selectionEnd: start + open.length + inner.length,
  };
}
