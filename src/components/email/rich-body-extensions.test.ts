// Headless (no DOM): TipTap 3 builds the editor's state, schema, commands
// and plugins without mounting a view, so the round trip through the REAL
// schema, the keys, typed input rules and the paste all run in node.

import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor, getSchema } from "@tiptap/react";
import type { EditorProps } from "@tiptap/pm/view";
import { DRAFT_COLORS } from "@/lib/email/draft-markup";
import { COLOR_CLASS, HIGHLIGHT_CLASS } from "@/lib/email/draft-markup-view";
import { docToMarkup, markupToDoc } from "@/lib/email/markup-doc";
import {
  enterLineBreak,
  insertMarkupText,
  joinWithLineBreak,
  replaceBodyContent,
  requestBodyEditorProps,
  requestBodyEditorPropsFor,
  requestBodyExtensions,
} from "./rich-body-extensions";
import { BODY_FRAME_CLASS, BODY_SURFACE_CLASS, COMPACT_FRAME_CLASS, COMPACT_SURFACE_CLASS } from "./rich-body-editor";

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
});

/** A headless editor on `markup`, plus the markup it holds now. */
function open(markup: string) {
  const editor = new Editor({ extensions: requestBodyExtensions, content: markupToDoc(markup), enablePasteRules: false });
  // Headless, the state carries no plugins until a view mounts: give it the
  // editor's own, so typed input rules run as they do in the browser.
  editor.view.updateState(editor.state.reconfigure({ plugins: editor.extensionManager.plugins }));
  editors.push(editor);
  return { editor, markup: () => docToMarkup(editor.getJSON()) };
}

/** The ProseMirror position just after the n-th occurrence of `needle`'s
 *  first character run — enough to put a caret in a short test body. */
function posOf(editor: Editor, needle: string, after = false): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found !== -1 || !node.isText) return;
    const at = node.text!.indexOf(needle);
    if (at !== -1) found = pos + at + (after ? needle.length : 0);
  });
  if (found === -1) throw new Error(`"${needle}" not in the doc`);
  return found;
}

/** Type like a person: each character goes to the plugins' handleTextInput
 *  (where the input rules live) in plugin order, else is inserted —
 *  ProseMirror's own order. */
function type(editor: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.state.plugins.some((p) => {
      const handler = p.props.handleTextInput;
      return handler ? handler.call(p, editor.view, from, to, ch, () => editor.state.tr) === true : false;
    });
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
  }
}

describe("the editor schema", () => {
  it("holds only what the draft markup can say", () => {
    const schema = getSchema(requestBodyExtensions);
    expect(Object.keys(schema.nodes).sort()).toEqual(["doc", "hardBreak", "paragraph", "text"]);
    expect(Object.keys(schema.marks).sort()).toEqual(["bold", "highlight", "italic", "textStyle", "underline"]);
    expect(Object.keys(schema.marks.textStyle.spec.attrs ?? {})).toEqual(["color"]);
  });

  it("highlight is the outermost mark, so one <mark> spans a run whatever changes inside it", () => {
    // Schema order is mark rank: the first mark renders outermost.
    const order = Object.keys(getSchema(requestBodyExtensions).marks);
    expect(order.indexOf("highlight")).toBe(0);
    expect(order.indexOf("textStyle")).toBe(1);
  });

  it("every marker, nested markers, empty paragraphs and a styled line break survive the real schema", () => {
    const body = "**b** __u__ ==h== {i}i{/i}\n{red}r\nr{/red} {amber}a{/amber} {green}g{/green} {blue}x{/blue}\n\n\n\n**bold ==both {i}three{/i}== bold**\n\n";
    expect(open(body).markup()).toBe(body);
  });
});

describe("formatting through the editor's commands writes markup", () => {
  it("toolbar commands: bold, italic, underline, highlight, a colour, clear", () => {
    const { editor, markup } = open("Please send it");
    const word = { from: posOf(editor, "send"), to: posOf(editor, "send", true) };
    editor.chain().setTextSelection(word).toggleBold().run();
    expect(markup()).toBe("Please **send** it");
    editor.chain().setTextSelection(word).toggleItalic().toggleUnderline().toggleHighlight().run();
    expect(markup()).toBe("Please **{i}__==send==__{/i}** it");
    editor.chain().setTextSelection(word).setColor(DRAFT_COLORS.red).run();
    expect(markup()).toBe("Please **{i}__{red}==send=={/red}__{/i}** it");
    editor.chain().setTextSelection(word).unsetAllMarks().run();
    expect(markup()).toBe("Please send it");
  });

  it("a selection with a trailing space still makes a valid bold pair", () => {
    const { editor, markup } = open("Please send it");
    editor.chain().setTextSelection({ from: posOf(editor, "send"), to: posOf(editor, "send ", true) }).toggleBold().run();
    expect(markup()).toBe("Please **send** it");
  });
});

describe("typing", () => {
  it("**x**, ==x== and __x__ typed become bold, highlight and UNDERLINE (not Bold's __ rule)", () => {
    const { editor, markup } = open("");
    type(editor, "a **b** c ==d== e __f__ g");
    expect(markup()).toBe("a **b** c ==d== e __f__ g");
    // …and the editor holds them as marks, not as literal markers.
    expect(editor.state.doc.textContent).toBe("a b c d e f g");
  });
});

describe("Enter, Backspace and Delete write newlines as a textarea did", () => {
  it("Enter is a line break; the second Enter makes the blank line (a paragraph)", () => {
    const { editor, markup } = open("ab");
    editor.commands.setTextSelection(posOf(editor, "a", true));
    expect(enterLineBreak(editor)).toBe(true);
    expect(markup()).toBe("a\nb");
    expect(enterLineBreak(editor)).toBe(true);
    expect(markup()).toBe("a\n\nb");
    expect(editor.state.doc.childCount).toBe(2);
    expect(enterLineBreak(editor)).toBe(true);
    expect(markup()).toBe("a\n\n\nb");
  });

  it("Enter keeps the bold it was typed in", () => {
    const { editor, markup } = open("**ab**");
    editor.commands.setTextSelection(posOf(editor, "ab", true));
    enterLineBreak(editor);
    type(editor, "c");
    expect(markup()).toBe("**ab**\n**c**");
  });

  it("Backspace at a paragraph's start and Delete at its end leave a line break", () => {
    const back = open("a\n\nb");
    back.editor.commands.setTextSelection(posOf(back.editor, "b"));
    expect(joinWithLineBreak(back.editor, "backward")).toBe(true);
    expect(back.markup()).toBe("a\nb");
    expect(back.editor.state.selection.from).toBe(posOf(back.editor, "b"));

    const fwd = open("a\n\nb");
    fwd.editor.commands.setTextSelection(posOf(fwd.editor, "a", true));
    expect(joinWithLineBreak(fwd.editor, "forward")).toBe(true);
    expect(fwd.markup()).toBe("a\nb");
    expect(fwd.editor.state.selection.from).toBe(posOf(fwd.editor, "a", true));
  });

  it("…and stay out of the way everywhere else", () => {
    const { editor } = open("ab\n\ncd");
    editor.commands.setTextSelection(posOf(editor, "a", true));
    expect(joinWithLineBreak(editor, "backward")).toBe(false);
    expect(joinWithLineBreak(editor, "forward")).toBe(false);
    editor.commands.setTextSelection(1);
    expect(joinWithLineBreak(editor, "backward")).toBe(false);
    editor.commands.setTextSelection({ from: 1, to: 3 });
    expect(joinWithLineBreak(editor, "backward")).toBe(false);
  });
});

describe("paste: plain text, read as markup", () => {
  it("lines and blank lines arrive as breaks and paragraphs; markers as formatting", () => {
    const { editor, markup } = open("Dear team,");
    insertMarkupText(editor.view, "\r\nFirst **one**\r\nsecond\r\n\r\nthird", posOf(editor, ",", true));
    expect(markup()).toBe("Dear team,\nFirst **one**\nsecond\n\nthird");
  });

  it("takes the formatting where it lands; its own markers win", () => {
    const { editor, markup } = open("{red}FedEx only.{/red}");
    insertMarkupText(editor.view, " Or DHL, **never** {blue}EMS{/blue}", posOf(editor, ".", true) - 1);
    expect(markup()).toBe("{red}FedEx only Or DHL, **never** {/red}{blue}EMS{/blue}{red}.{/red}");
  });

  it("an empty clipboard changes nothing", () => {
    const { editor, markup } = open("x");
    insertMarkupText(editor.view, "", 1);
    expect(markup()).toBe("x");
  });
});

describe("replaceBodyContent (a value from outside the editor)", () => {
  it("fires no update event and is not undoable; an edit after it does fire", () => {
    const { editor, markup } = open("a");
    const seen: string[] = [];
    editor.on("update", ({ editor: e }) => seen.push(docToMarkup(e.getJSON())));
    replaceBodyContent(editor, "x **b**");
    expect(markup()).toBe("x **b**");
    expect(seen).toEqual([]);
    editor.commands.setTextSelection(1);
    type(editor, "c");
    expect(seen).toEqual(["cx **b**"]);
    // ⌘Z takes back the typing, never the replacement.
    editor.commands.undo();
    editor.commands.undo();
    expect(markup()).toBe("x **b**");
  });

  it("keeps the caret where it was, moved into text when that spot is now between paragraphs", () => {
    const { editor } = open("abcdef");
    editor.commands.setTextSelection(4);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // In "ab\n\ncd", position 4 sits between the two paragraphs.
      replaceBodyContent(editor, "ab\n\ncd");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    const { $from, $to } = editor.state.selection;
    expect($from.parent.inlineContent).toBe(true);
    expect($to.parent.inlineContent).toBe(true);
  });

  it("clamps a caret beyond the new end", () => {
    const { editor } = open("a long first body");
    editor.commands.setTextSelection(15);
    replaceBodyContent(editor, "hi");
    expect(editor.state.selection.from).toBe(3);
  });
});

// Task 11 review: measured in headless Chrome, an overflow-hidden frame let
// the compose's scroll region squeeze the body to 2 px under tall fields — a
// flex item that clips has no content minimum. Layout can't be measured in
// node; the classes that decide it can be pinned.
describe("the editor frame keeps its height in the compose's scroll region", () => {
  const tokens = (c: string) => c.split(/\s+/);
  it("the frame never clips (nor zeroes its min-height): it keeps toolbar + 320 px", () => {
    expect(tokens(BODY_FRAME_CLASS).filter((t) => /^overflow-|^min-h-0$/.test(t))).toEqual([]);
    expect(tokens(BODY_FRAME_CLASS)).toContain("flex-1");
  });
  it("the surface holds the 320 px floor and scrolls inside past it", () => {
    expect(tokens(BODY_SURFACE_CLASS)).toEqual(expect.arrayContaining(["min-h-[320px]", "overflow-y-auto"]));
  });
  // iOS zooms the page into any input or editable under 16px on focus: the
  // phone size is text-base (16px), the small size only from md up.
  it("the body is 16px on phones (no iOS focus zoom)", () => {
    const bodyClass = (requestBodyEditorProps.attributes as Record<string, string>).class;
    for (const cls of [bodyClass]) {
      const t = tokens(cls);
      expect(t).toContain("text-base");
      expect(t.filter((x) => /^text-\[\d+px\]$/.test(x))).toEqual([]);
      expect(t.some((x) => /^md:text-\[\d+px\]$/.test(x))).toBe(true);
    }
  });
});

// Spec 2026-10-15 §7 / X11: the courier-instructions field is the same editor
// in a short frame, with red as the colour of text that carries no colour mark.
describe("the compact instructions variant", () => {
  const tokens = (c: string) => c.split(/\s+/);
  /** editorProps.attributes is what TipTap hands ProseMirror as the editable
   *  element's own attributes (the label and class land on the contenteditable;
   *  a headless editor has no view to read them back from). */
  const attributesOf = (props: EditorProps) => props.attributes as Record<string, string>;

  it("an editor given neither prop gets the shared props themselves (compose rendering untouched)", () => {
    expect(requestBodyEditorPropsFor()).toBe(requestBodyEditorProps);
    expect(requestBodyEditorPropsFor(undefined, undefined)).toBe(requestBodyEditorProps);
  });

  it("the label goes in the editable element's attributes, replacing 'Message body'", () => {
    const attrs = attributesOf(requestBodyEditorPropsFor(undefined, "Courier instructions"));
    expect(attrs["aria-label"]).toBe("Courier instructions");
    expect(attrs.class).toBe((requestBodyEditorProps.attributes as Record<string, string>).class);
    expect(attributesOf(requestBodyEditorProps)["aria-label"]).toBe("Message body");
  });

  it("the base colour's class replaces text-foreground in the editable element's class", () => {
    const base = tokens((requestBodyEditorProps.attributes as Record<string, string>).class);
    const attrs = attributesOf(requestBodyEditorPropsFor("red", "Courier instructions"));
    const t = tokens(attrs.class);
    expect(t).toEqual(expect.arrayContaining(tokens(COLOR_CLASS.red)));
    expect(t).not.toContain("text-foreground");
    // Nothing else about the surface moved: same classes, bar that one and
    // the highlight's base colour (below).
    expect(t.filter((x) => !tokens(COLOR_CLASS.red).includes(x) && x !== "[&_mark]:text-inherit")).toEqual(
      base.filter((x) => x !== "text-foreground"),
    );
    expect(attrs["aria-multiline"]).toBe("true");
  });

  it("with a base colour, a highlight with no colour mark takes it — never the highlight's charcoal (X11)", () => {
    // The <mark> keeps the shared extension's class (text-foreground); the
    // editable element's descendant rule makes it inherit the base colour.
    // A colour mark is a span inside the <mark> (highlight is outermost,
    // above) and keeps its own colour.
    const highlight = requestBodyExtensions.find((e) => e.name === "highlight");
    expect((highlight?.options as { HTMLAttributes?: { class?: string } }).HTMLAttributes?.class).toBe(HIGHLIGHT_CLASS);
    expect(tokens(attributesOf(requestBodyEditorPropsFor("red")).class)).toContain("[&_mark]:text-inherit");
    expect(tokens(attributesOf(requestBodyEditorPropsFor("blue", "Notes")).class)).toContain("[&_mark]:text-inherit");
    // No base colour (the compose body): untouched, the highlight stays charcoal.
    expect(tokens(attributesOf(requestBodyEditorPropsFor(undefined, "Courier instructions")).class)).not.toContain(
      "[&_mark]:text-inherit",
    );
    expect(tokens(attributesOf(requestBodyEditorProps).class)).not.toContain("[&_mark]:text-inherit");
  });

  it("the shared props are not mutated by a variant", () => {
    requestBodyEditorPropsFor("red", "Courier instructions");
    const shared = requestBodyEditorProps.attributes as Record<string, string>;
    expect(shared["aria-label"]).toBe("Message body");
    expect(tokens(shared.class)).toContain("text-foreground");
  });

  it("the frame takes no flex slack and the surface runs 80 px to 192 px, scrolling inside", () => {
    expect(tokens(COMPACT_FRAME_CLASS)).not.toContain("flex-1");
    expect(tokens(COMPACT_FRAME_CLASS).filter((t) => /^overflow-|^min-h-0$/.test(t))).toEqual([]);
    expect(tokens(COMPACT_SURFACE_CLASS)).toEqual(expect.arrayContaining(["min-h-20", "max-h-48", "overflow-y-auto"]));
  });
});
