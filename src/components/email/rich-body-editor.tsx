// src/components/requests/request-body-editor.tsx
//
// The WYSIWYG body of the sample and EUDR request composes (spec
// 2026-10-14 D11, §7) — staff and portal alike. TipTap on the outside; on
// the inside the body is still the draft-markup TEXT (markup-doc.ts
// translates both ways), so the compose's state, its template rebuilds,
// "Put it back", the D6 check and the send never see a document. S/I and
// status requests keep their monospace textarea (column-aligned text).
//
// Client-only: RequestComposeModal loads it with next/dynamic, ssr:false.

"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type ChainedCommands } from "@tiptap/react";
import { Bold, Highlighter, Italic, RemoveFormatting, Underline } from "lucide-react";
import { cn } from "@/lib/utils";
import { DRAFT_COLORS, type DraftColor } from "@/lib/email/draft-markup";
import { docToMarkup, draftColorOf, markupToDoc } from "@/lib/email/markup-doc";
import { BTN, COLOR_ORDER, SWATCH_CLASS } from "@/components/email/draft-format";
import {
  replaceBodyContent,
  requestBodyEditorPropsFor,
  requestBodyExtensions,
} from "@/components/email/rich-body-extensions";

// The draft card's toolbar buttons (44 px on the phone, 28 px with a
// pointer), plus a pressed state for the mark under the caret.
const PRESSED = "border-foreground/40 bg-accent text-foreground";

/** The frame is the flex item in the compose's scroll region: flex-1 takes a
 *  full-screen dialog's slack. It must NOT clip (no overflow-*): a flex item
 *  that clips has no content minimum, and the region then squeezed the body
 *  to a sliver under tall fields (review, measured in Chrome). Unclipped, its
 *  minimum is the toolbar (two rows on a phone) + the surface's 320 px, and
 *  the region scrolls instead. */
export const BODY_FRAME_CLASS =
  "flex w-full flex-1 flex-col rounded border border-border bg-background focus-within:border-foreground/40";

/** The writing surface the textarea was: 320 px at least, the slack beyond
 *  that, scrolling inside past both. */
export const BODY_SURFACE_CLASS = "flex min-h-[320px] grow basis-0 flex-col overflow-y-auto";

/** The courier-instructions field (spec 2026-10-15 §7): no flex slack, 80 px
 *  at least, scrolling inside past 192. */
export const COMPACT_FRAME_CLASS =
  "flex w-full flex-col rounded-md border border-border bg-background focus-within:border-foreground/40";
export const COMPACT_SURFACE_CLASS = "flex min-h-20 max-h-48 flex-col overflow-y-auto";

export function RichBodyEditor({
  value,
  onChange,
  compact = false,
  baseColor,
  ariaLabel,
}: {
  /** The body as draft markup. */
  value: string;
  /** Called with the new markup on every edit — never for a `value` change. */
  onChange: (markup: string) => void;
  /** A short field — the courier instructions — not the compose's 320 px body. */
  compact?: boolean;
  /** Text with no colour mark shows (and is sent) in this colour; its swatch
   *  reads pressed while no colour is set, and pressing it clears the colour
   *  (spec 2026-10-15 X11). */
  baseColor?: DraftColor;
  /** The editable element's label; "Message body" when not given. */
  ariaLabel?: string;
}) {
  // The markup this editor last emitted or was last handed. A `value`
  // equal to it is the echo of the trader's own keystroke and leaves the
  // document (and the caret) alone; any other value came from outside — a
  // template rebuild, the language switch, "Put it back", the next batch —
  // and replaces the content. Hence no onChange → value → setContent loop.
  const lastRef = useRef(value);
  // Read once: the editor is created with it, later values go through the effect.
  const [initialContent] = useState(() => markupToDoc(value));
  // Read once, like the content: the label and the base colour's class go on
  // the editable element (requestBodyEditorPropsFor).
  const [editorProps] = useState(() => requestBodyEditorPropsFor(baseColor, ariaLabel));

  const editor = useEditor({
    // Never server-rendered (dynamic, ssr:false), so build on first render.
    immediatelyRender: true,
    extensions: requestBodyExtensions,
    content: initialContent,
    // Paste is ours (plain text, read as markup); no paste rules on top.
    enablePasteRules: false,
    editorProps,
    onUpdate: ({ editor: e }) => {
      const next = docToMarkup(e.getJSON());
      // Formatting a lone space changes the document, not the markup.
      if (next === lastRef.current) return;
      lastRef.current = next;
      onChange(next);
    },
  });

  useEffect(() => {
    if (value === lastRef.current) return;
    lastRef.current = value;
    // Not undoable, no update event, the caret kept (replaceBodyContent).
    replaceBodyContent(editor, value);
  }, [editor, value]);

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      highlight: e.isActive("highlight"),
      color: draftColorOf(e.getAttributes("textStyle").color),
    }),
  });

  // No colour mark on the selection reads as the base colour (spec §7).
  const shown = active.color ?? baseColor ?? null;

  const apply = (command: (chain: ChainedCommands) => ChainedCommands) => command(editor.chain().focus()).run();

  const toggles = [
    { key: "bold", label: "Bold (⌘B)", Icon: Bold, run: (c: ChainedCommands) => c.toggleBold() },
    { key: "italic", label: "Italic (⌘I)", Icon: Italic, run: (c: ChainedCommands) => c.toggleItalic() },
    { key: "underline", label: "Underline (⌘U)", Icon: Underline, run: (c: ChainedCommands) => c.toggleUnderline() },
    { key: "highlight", label: "Highlight (⌘⇧H)", Icon: Highlighter, run: (c: ChainedCommands) => c.toggleHighlight() },
  ] as const;

  return (
    <div className={compact ? COMPACT_FRAME_CLASS : BODY_FRAME_CLASS}>
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-1.5 py-1"
        // Keep the selection: a press on the toolbar must not blur the body.
        onMouseDown={(e) => e.preventDefault()}
      >
        {toggles.map(({ key, label, Icon, run }) => (
          <button
            key={key}
            type="button"
            className={cn(BTN, active[key] && PRESSED)}
            title={label}
            aria-label={label.replace(/ \(.*\)$/, "")}
            aria-pressed={active[key]}
            onClick={() => apply(run)}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        ))}
        {COLOR_ORDER.map((c) => (
          <button
            key={c}
            type="button"
            className={cn(BTN, shown === c && PRESSED)}
            title={`${c[0].toUpperCase()}${c.slice(1)} text`}
            aria-label={`${c} text`}
            aria-pressed={shown === c}
            // A second press on the colour already there takes it off; the
            // base colour's swatch always does (it is what "no colour" shows).
            onClick={() => apply((ch) => (c === baseColor || active.color === c ? ch.unsetColor() : ch.setColor(DRAFT_COLORS[c])))}
          >
            <span
              className={cn("h-4 w-4 rounded-full", SWATCH_CLASS[c])}
              style={{ backgroundColor: DRAFT_COLORS[c] }}
              aria-hidden="true"
            />
          </button>
        ))}
        <button
          type="button"
          className={BTN}
          title="Clear formatting"
          aria-label="Clear formatting"
          onClick={() =>
            apply((ch) =>
              ch.unsetAllMarks().command(({ tr }) => {
                // With nothing selected, what is typed next comes out plain.
                if (tr.selection.empty) tr.setStoredMarks([]);
                return true;
              }),
            )
          }
        >
          <RemoveFormatting className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <EditorContent editor={editor} className={compact ? COMPACT_SURFACE_CLASS : BODY_SURFACE_CLASS} />
    </div>
  );
}
