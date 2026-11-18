import { Fragment, type ReactNode } from "react";
import { parseDraftMarkup, splitDraftParagraphs, type DraftColor } from "./draft-markup";

/* --------------------------------------------------------------------
 * The in-app reader for draft markup. The inbox's Up-next / focus / phone
 * panes show the body a person is about to send; they render the SAME
 * segments `renderDraftMarkup` turns into mail HTML, so what the pane shows
 * is what leaves. React elements, never dangerouslySetInnerHTML — the
 * text is prose typed by a person or a model and stays text.
 *
 * Paragraphs are joined back with "\n\n" and newlines are kept in the
 * text nodes: every pane that shows a draft is `whitespace-pre-line`, and
 * this renderer must not change how an unmarked body has always looked.
 *
 * App colours are Tailwind classes so they read on both themes; the mail's
 * inline hex lives in draft-markup.ts and is not copied here.
 * ------------------------------------------------------------------ */

export const COLOR_CLASS: Record<DraftColor, string> = {
  red: "text-red-600 dark:text-red-400",
  amber: "text-amber-700 dark:text-amber-300",
  green: "text-emerald-700 dark:text-emerald-300",
  blue: "text-blue-700 dark:text-blue-300",
};

export const HIGHLIGHT_CLASS =
  "rounded bg-amber-300/70 px-0.5 text-foreground dark:bg-amber-500/50";

/** A highlight on a base-coloured surface: its text in `color` (the run's
 *  own colour, else the base) in place of HIGHLIGHT_CLASS's charcoal — the
 *  mail paints it so (withBaseColor), and there is no black (X11). */
function highlightIn(color: DraftColor): string {
  return HIGHLIGHT_CLASS.replace("text-foreground", COLOR_CLASS[color]);
}

/** `baseColor`: see DraftMarkup. Without it the output is what it always was. */
export function renderDraftMarkupNodes(text: string, baseColor?: DraftColor): ReactNode {
  const paragraphs = splitDraftParagraphs(text);
  return paragraphs.map((para, pi) => {
    const segs = parseDraftMarkup(para);
    return (
      <Fragment key={pi}>
        {pi > 0 ? "\n\n" : null}
        {segs.map((seg, si) => {
          let node: ReactNode = seg.text;
          if (seg.underline) node = <u>{node}</u>;
          if (seg.italic) node = <em>{node}</em>;
          if (seg.bold) node = <strong>{node}</strong>;
          if (seg.highlight) {
            node = <mark className={baseColor ? highlightIn(seg.color ?? baseColor) : HIGHLIGHT_CLASS}>{node}</mark>;
          }
          if (seg.color) node = <span className={COLOR_CLASS[seg.color]}>{node}</span>;
          return <Fragment key={si}>{node}</Fragment>;
        })}
      </Fragment>
    );
  });
}

/** `<DraftMarkup text={draft.body} />` inside any `whitespace-pre-line` box.
 *  With `baseColor`, text the markup leaves uncoloured shows in that colour —
 *  the courier instructions' red (spec 2026-10-15 X11), highlighted text
 *  included; a coloured span keeps its own, highlighted or not. */
export function DraftMarkup({ text, baseColor }: { text: string; baseColor?: DraftColor }) {
  const nodes = renderDraftMarkupNodes(text, baseColor);
  return baseColor ? <span className={COLOR_CLASS[baseColor]}>{nodes}</span> : <>{nodes}</>;
}
