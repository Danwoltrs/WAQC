// src/components/requests/request-body-extensions.ts
//
// The TipTap set-up behind RequestBodyEditor (spec 2026-10-14 D11, §7):
// exactly the formatting the draft markup can say — bold, italic,
// underline, highlight and the four colours — and nothing it can't
// (headings, lists, code, quotes, rules, strike, links are all off). Kept
// apart from the component so the schema, the keys and the paste can be
// exercised headless in a node test.
//
// The body the trader edits was a textarea, and what the editor writes is
// still that text: Enter is "\n" (a line break), and a second Enter makes
// the blank line — a paragraph in the mail — exactly as it did there.

import { Extension, markInputRule, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Highlight } from "@tiptap/extension-highlight";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Fragment, Slice, type Mark, type Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorProps, EditorView } from "@tiptap/pm/view";
import { DRAFT_COLORS, type DraftColor } from "@/lib/email/draft-markup";
import { COLOR_CLASS, HIGHLIGHT_CLASS } from "@/lib/email/draft-markup-view";
import { draftColorOf, markupToDoc } from "@/lib/email/markup-doc";

/** Colour lives on TextStyle as a hex (the mail's DRAFT_COLORS value) and
 *  only the four draft colours survive a parse. On screen it is the app's
 *  theme-safe class — the same one the inbox's draft panes use — not the
 *  mail's inline hex, which is unreadable on the dark theme. */
const DraftColorExtension = Color.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          color: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const name = draftColorOf(element.getAttribute("data-draft-color") ?? element.style.color);
              return name ? DRAFT_COLORS[name] : null;
            },
            renderHTML: (attributes: { color?: unknown }) => {
              const name = draftColorOf(attributes.color);
              return name ? { "data-draft-color": name, class: COLOR_CLASS[name] } : {};
            },
          },
        },
      },
    ];
  },
});

/** `__word__` typed is underline in the markup. Bold's own input rule
 *  reads it as bold, so this one runs first (priority) and wins. */
const UNDERLINE_INPUT = /(?:^|\s)(__(?!\s+__)((?:[^_]+))__(?!\s+__))$/;

/** Enter: a line break; the second Enter of a pair turns the two into a
 *  paragraph break — "\n" then "\n\n", as typed into a textarea. */
export function enterLineBreak(editor: Editor): boolean {
  const { $from, empty } = editor.state.selection;
  if (empty && $from.nodeBefore?.type.name === "hardBreak") {
    return editor
      .chain()
      .deleteRange({ from: $from.pos - 1, to: $from.pos })
      .splitBlock()
      .scrollIntoView()
      .run();
  }
  return editor.commands.setHardBreak();
}

/** Backspace at a paragraph's start / Delete at its end removes ONE of the
 *  blank line's two newlines, leaving a line break — the inverse of the
 *  second Enter. False (the default keys) anywhere else. */
export function joinWithLineBreak(editor: Editor, direction: "backward" | "forward"): boolean {
  const { $from, empty } = editor.state.selection;
  if (!empty || $from.depth !== 1) return false;
  const index = $from.index(0);
  const pos = $from.pos;
  let from: number;
  if (direction === "backward") {
    if ($from.parentOffset !== 0 || index === 0) return false;
    from = pos - 2;
  } else {
    if ($from.parentOffset !== $from.parent.content.size || index === $from.node(0).childCount - 1) return false;
    from = pos;
  }
  return editor
    .chain()
    .command(({ tr }) => {
      tr.replaceWith(from, from + 2, editor.schema.nodes.hardBreak.create());
      // The caret stays where it was: after the break going back, before it going forward.
      tr.setSelection(TextSelection.create(tr.doc, direction === "backward" ? from + 1 : from));
      return true;
    })
    .scrollIntoView()
    .run();
}

const DraftMarkupKeys = Extension.create({
  name: "draftMarkupKeys",
  // Ahead of the core keymap (Enter splits a paragraph) and of Bold's
  // input rules (`__x__` → bold).
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => enterLineBreak(editor),
      Backspace: ({ editor }) => joinWithLineBreak(editor, "backward"),
      Delete: ({ editor }) => joinWithLineBreak(editor, "forward"),
    };
  },
  addInputRules() {
    return [markInputRule({ find: UNDERLINE_INPUT, type: this.editor.schema.marks.underline })];
  },
});

/** Module-level and stable: useEditor compares extensions by identity. */
export const requestBodyExtensions = [
  StarterKit.configure({
    heading: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    codeBlock: false,
    code: false,
    blockquote: false,
    horizontalRule: false,
    strike: false,
    link: false,
    trailingNode: false,
  }),
  // Outermost mark (above TextStyle's 101): ONE <mark> spans a highlighted
  // run however its bold / colour changes inside, so the padded highlight
  // never breaks into pieces, and a coloured word inside keeps its colour.
  Highlight.extend({ priority: 102 }).configure({ multicolor: false, HTMLAttributes: { class: HIGHLIGHT_CLASS } }),
  TextStyle,
  DraftColorExtension,
  DraftMarkupKeys,
];

/**
 * Insert plain text at the selection (or at `at`), read as draft markup:
 * pasted "**x**" shows bold here because it WILL be bold in the mail. The
 * text takes the formatting where it lands, as typing does (Outlook's
 * "Keep text only"); its own markers win over that.
 */
export function insertMarkupText(view: EditorView, text: string, at?: number): void {
  const clean = text.replace(/\r\n?/g, "\n");
  if (!clean) return;
  const { tr, schema } = view.state;
  if (at !== undefined) tr.setSelection(TextSelection.create(tr.doc, at));
  const context: readonly Mark[] = tr.storedMarks ?? tr.selection.$from.marks();
  const paragraphs = markupToDoc(clean).content.map((json) => {
    const paragraph = schema.nodeFromJSON(json);
    if (context.length === 0) return paragraph;
    const kids: PMNode[] = [];
    paragraph.forEach((child) => kids.push(child.mark(child.marks.reduce((set, m) => m.addToSet(set), context))));
    return paragraph.copy(Fragment.from(kids));
  });
  view.dispatch(tr.replaceSelection(new Slice(Fragment.from(paragraphs), 1, 1)).scrollIntoView());
}

/**
 * Replace the whole body with `markup` from OUTSIDE the editor — a template
 * rebuild, the language switch, "Put it back", the next batch. Not undoable
 * (⌘Z must not bring back the previous batch's email), no update event (it
 * is not the trader's edit), and the caret stays where it was — clamped to
 * the new body, and moved into text when that spot now falls between two
 * paragraphs (a bare position there is no valid caret).
 */
export function replaceBodyContent(editor: Editor, markup: string): void {
  const { from, to } = editor.state.selection;
  editor
    .chain()
    .setMeta("addToHistory", false)
    .setContent(markupToDoc(markup), { emitUpdate: false })
    .command(({ tr }) => {
      const at = (pos: number) => tr.doc.resolve(Math.max(0, Math.min(pos, tr.doc.content.size)));
      tr.setSelection(TextSelection.between(at(from), at(to)));
      return true;
    })
    .run();
}

/** On a base-coloured surface, a highlight with no colour mark takes the
 *  base colour, not HIGHLIGHT_CLASS's charcoal — the mail paints it so
 *  (withBaseColor), and there is no black (X11). The <mark>'s class is the
 *  Highlight extension's, shared by every editor, so the editable element
 *  overrides it: a descendant rule outranks the mark's own class. A colour
 *  mark inside a highlight is a span INSIDE the <mark> (Highlight is the
 *  outermost mark) and keeps its own colour. */
const MARK_TAKES_BASE_COLOR = "[&_mark]:text-inherit";

/** Shared by every RequestBodyEditor (stable, like the extensions). */
export const requestBodyEditorProps: EditorProps = {
  attributes: {
    "aria-label": "Message body",
    "aria-multiline": "true",
    // grow: fills the scroll box, so a click below the text still lands in it.
    // [&_p]:mb-3 is the mail's 12px paragraph margin. 16px on phones
    // (text-base): iOS zooms the page into an editable under 16px on focus.
    class:
      "grow px-2.5 py-1.5 font-sans text-base md:text-[13px] leading-relaxed text-foreground outline-none [&_p]:mb-3 [&_p:last-child]:mb-0",
  },
  // Plain text only: Word / Outlook / web HTML would bring fonts, sizes and
  // colours the markup cannot carry.
  handlePaste: (view, event) => {
    insertMarkupText(view, event.clipboardData?.getData("text/plain") ?? "");
    return true;
  },
  // The same for text dragged in from outside; a drag within the body
  // moves its own (markup-safe) content as usual.
  handleDrop: (view, event, _slice, moved) => {
    if (moved) return false;
    const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (at) {
      insertMarkupText(view, event.dataTransfer?.getData("text/plain") ?? "", at.pos);
      view.focus();
    }
    return true;
  },
  handleDOMEvents: {
    // The dashboard sidebar listens on window for ⌘I (new inquiry) and
    // would navigate away mid-email: the editor's own format keys end here.
    // Escape is not touched — it still closes the dialog.
    keydown: (_view, event) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && /^[biu]$/i.test(event.key)) event.stopPropagation();
      return false;
    },
  },
};

/**
 * The props for one RequestBodyEditor. Given neither argument it IS the
 * shared set — the compose's body renders exactly as it always has. A
 * `label` replaces "Message body" on the editable element; a `baseColor`
 * puts that colour's class on it in place of text-foreground, so text with
 * no colour mark shows in it (the courier instructions' red, spec
 * 2026-10-15 X11), highlighted text included (MARK_TAKES_BASE_COLOR). A
 * coloured span carries its own class and keeps its colour.
 */
export function requestBodyEditorPropsFor(baseColor?: DraftColor, label?: string): EditorProps {
  if (!baseColor && !label) return requestBodyEditorProps;
  const attributes = requestBodyEditorProps.attributes as Record<string, string>;
  return {
    ...requestBodyEditorProps,
    attributes: {
      ...attributes,
      "aria-label": label ?? attributes["aria-label"],
      class: baseColor
        ? `${attributes.class.replace("text-foreground", COLOR_CLASS[baseColor])} ${MARK_TAKES_BASE_COLOR}`
        : attributes.class,
    },
  };
}
