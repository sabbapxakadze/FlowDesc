import { useEffect, useId, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import {
  Bold,
  Code,
  Italic,
  Link2,
  List,
  ListOrdered,
  Strikethrough,
} from "lucide-react";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_INLINE_IMAGES,
  isSafeLinkUrl,
} from "@flowdesc/contracts";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { cn } from "../lib/cn";
import { Button } from "../Button";
import { IconButton } from "../IconButton";
import { Input } from "../Input";
import type { MentionCandidate } from "./types";
import { buildExtensions } from "./extensions";

export interface RichTextEditorProps {
  /** The stored body: the Markdown subset of ADR 0056, with @mention tokens (ADR 0033). */
  value: string;
  onChange: (markdown: string) => void;
  /** The people the `@` list offers. Domain-free: the caller supplies them. */
  candidates?: MentionCandidate[];
  placeholder?: string;
  /** The text box's accessible name (there is no <label> for a rich text box). */
  ariaLabel: string;
  disabled?: boolean;
  /** Put the cursor in the box (at the end of its text) when it appears. */
  autoFocus?: boolean;
  className?: string;
  /**
   * Stores one pasted or dropped picture (ADR 0062) and gives back its id and address. Without it the box ignores pictures. Domain-free: the
   * caller decides where the file goes.
   */
  uploadImage?: (file: File) => Promise<{ id: string; url: string; name: string }>;
  /** Pictures already stored, so a comment opened for editing can show them. */
  images?: { id: string; url: string }[];
  /** Told when the number of pictures still uploading goes between zero and more, so the form can wait before posting. */
  onUploadingChange?: (uploading: boolean) => void;
}

/** Only these can be pasted inline: the images among the allowed attachment types (no SVG, which can carry script). */
const PASTE_TYPES = (ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).filter((type) =>
  type.startsWith("image/"),
);

const imageFiles = (list: FileList | null | undefined) =>
  Array.from(list ?? []).filter((file) => file.type.startsWith("image/"));

const MAX_SHOWN = 8;
const LIST_MAX_HEIGHT = 224;

type Suggest = {
  items: MentionCandidate[];
  active: number;
  command: (candidate: { id: string; label: string }) => void;
  rect: DOMRect | null;
};

/** "example.com" is what people type; the link needs a scheme. Anything that already has one is left for the safety check to judge. */
function withScheme(url: string): string {
  const trimmed = url.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) || !/^[^\s/]+\.[^\s/]+/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
}

/**
 * The comment editor (ADR 0056): the text is formatted while you type, with a toolbar and keyboard shortcuts for bold, italic, strikethrough,
 * code, link and lists, and `@` opens a list of people. It reads and writes the stored Markdown, so what it holds and what the comment card draws
 * are the same text. Loaded on demand (see RichTextEditor.tsx): the editor library is about 150 KB of the download.
 *
 * Controlled like a text box: `value` in, `onChange(markdown)` out; a `value` that did not come from this editor (cleared after posting, a comment
 * opened for editing) replaces the content.
 */
export default function RichTextEditorImpl({
  value,
  onChange,
  candidates = [],
  placeholder,
  ariaLabel,
  disabled = false,
  autoFocus = false,
  className,
  uploadImage,
  images = [],
  onUploadingChange,
}: RichTextEditorProps) {
  const listId = useId();
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [imageErrors, setImageErrors] = useState<string[]>([]);
  const uploading = useRef(0);
  const lastEmitted = useRef(value);
  const linkInputRef = useRef<HTMLInputElement>(null);
  // The editor is built once and keeps calling the functions it was given, so what they need to see change (the people, the submit handler, the
  // open list, the link box) is read through these refs, which are brought up to date after every render (never during one).
  const candidatesRef = useRef<MentionCandidate[]>([]);
  const suggestRef = useRef<Suggest | null>(null);
  const openLinkRef = useRef<() => void>(() => undefined);
  const uploadImageRef = useRef(uploadImage);
  const imagesRef = useRef(images);
  const onUploadingChangeRef = useRef(onUploadingChange);
  const addImagesRef = useRef<(view: EditorView, files: File[], at?: number) => void>(
    () => undefined,
  );
  useEffect(() => {
    candidatesRef.current = candidates;
    suggestRef.current = suggest;
    uploadImageRef.current = uploadImage;
    imagesRef.current = images;
    onUploadingChangeRef.current = onUploadingChange;
  });

  const extensions = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- latest-callback pattern: the refs are read when a key is pressed or a list opens, written in an effect
      buildExtensions({
        placeholder,
        // The ref is only read when the shortcut is pressed (an event), never while rendering; the editor is built once, so it cannot be handed a new function.
        onLinkShortcut: () => openLinkRef.current(),
        imageUrl: (id) => imagesRef.current.find((image) => image.id === id)?.url,
        suggestion: {
          items: ({ query }) => {
            const q = query.toLowerCase();
            return candidatesRef.current
              .filter((c) => c.name.toLowerCase().includes(q))
              .sort(
                (a, b) =>
                  Number(b.name.toLowerCase().startsWith(q)) -
                  Number(a.name.toLowerCase().startsWith(q)),
              )
              .slice(0, MAX_SHOWN);
          },
          render: () => ({
            onStart: (props) =>
              setSuggest({
                items: props.items as MentionCandidate[],
                active: 0,
                command: props.command as Suggest["command"],
                rect: props.clientRect?.() ?? null,
              }),
            onUpdate: (props) =>
              setSuggest((prev) => ({
                items: props.items as MentionCandidate[],
                active: Math.min(prev?.active ?? 0, Math.max(0, props.items.length - 1)),
                command: props.command as Suggest["command"],
                rect: props.clientRect?.() ?? null,
              })),
            onKeyDown: ({ event }) => {
              const current = suggestRef.current;
              if (!current || current.items.length === 0) return false;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                const step = event.key === "ArrowDown" ? 1 : current.items.length - 1;
                setSuggest({
                  ...current,
                  active: (current.active + step) % current.items.length,
                });
                return true;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                const picked = current.items[current.active];
                if (picked) current.command({ id: picked.id, label: picked.name });
                return true;
              }
              return false; // Escape is handled by the suggestion plugin itself, which calls onExit
            },
            onExit: () => setSuggest(null),
          }),
        },
      }),
    // Built once per placeholder: everything else is read through the refs.
    [placeholder],
  );

  const editor = useEditor({
    extensions,
    content: value,
    contentType: "markdown",
    editable: !disabled,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      // A picture file on the clipboard or dropped on the box becomes a picture in the text (ADR 0062). Pasted text and page content go the normal way.
      handlePaste: (view, event) => {
        if (!uploadImageRef.current) return false;
        const files = imageFiles(event.clipboardData?.files);
        if (files.length === 0) return false;
        addImagesRef.current(view, files);
        return true;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved || !uploadImageRef.current) return false;
        const files = imageFiles(event.dataTransfer?.files);
        if (files.length === 0) return false;
        addImagesRef.current(
          view,
          files,
          view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos,
        );
        return true;
      },
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": ariaLabel,
        class:
          "rich-text-content px-3 py-2 text-sm text-[var(--color-text-default)] outline-none",
      },
    },
    onUpdate: ({ editor: e }) => {
      const markdown = e.getMarkdown();
      lastEmitted.current = markdown;
      onChange(markdown);
    },
  });

  /**
   * Puts each picture in the text at once, from the local file, and uploads it; when the upload ends the placeholder becomes the stored file.
   * A picture that cannot be accepted (wrong type, too big, over the limit) or whose upload fails never gets a place in the text: a short message
   * under the box says why. The node is found again by its `uploadId` because the text may have changed while the file travelled.
   */
  useEffect(() => {
    addImagesRef.current = (view, files, at) => {
      const upload = uploadImageRef.current;
      if (!editor || !upload) return;
      const problems: string[] = [];
      let count = 0;
      view.state.doc.descendants((node) => {
        if (node.type.name === "inlineImage") count++;
      });
      // A picture is a block: it goes after the line the cursor (or the drop) is on, never in the middle of the text. An empty line is used up by it.
      const $at = view.state.doc.resolve(at ?? view.state.selection.to);
      let position = $at.parent.isTextblock
        ? $at.parent.content.size === 0
          ? $at.before()
          : $at.after()
        : $at.pos;
      let replaceEmpty = $at.parent.isTextblock && $at.parent.content.size === 0;
      for (const file of files) {
        if (!PASTE_TYPES.includes(file.type)) {
          problems.push(
            `"${file.name}": only PNG, JPEG, GIF and WebP pictures can be pasted here.`,
          );
          continue;
        }
        if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
          problems.push(
            `"${file.name}" is too large (max ${Math.round(MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024))}MB).`,
          );
          continue;
        }
        if (count >= MAX_INLINE_IMAGES) {
          problems.push(`A comment can show at most ${MAX_INLINE_IMAGES} pictures.`);
          break;
        }
        count++;
        const uploadId = crypto.randomUUID();
        const node = view.state.schema.nodes.inlineImage!.create({
          alt: file.name,
          src: URL.createObjectURL(file),
          status: "uploading",
          uploadId,
        });
        const tr = view.state.tr;
        if (replaceEmpty) tr.delete(position, position + 1); // the empty line the picture replaces
        replaceEmpty = false;
        tr.insert(position, node);
        position += node.nodeSize;
        // Something to type in after the picture: a new empty line when the picture ended the text.
        if (position >= tr.doc.content.size)
          tr.insert(position, view.state.schema.nodes.paragraph!.create());
        // The cursor moves to the line after the picture, so typing carries on there, like a chat.
        tr.setSelection(TextSelection.near(tr.doc.resolve(position)));
        view.dispatch(tr);
        uploading.current++;
        if (uploading.current === 1) onUploadingChangeRef.current?.(true);

        const finish = (change: (pos: number) => void) => {
          let found = -1;
          editor.view.state.doc.descendants((n, pos) => {
            if (n.type.name === "inlineImage" && n.attrs.uploadId === uploadId)
              found = pos;
          });
          if (found >= 0) change(found);
          URL.revokeObjectURL(node.attrs.src as string);
          uploading.current--;
          if (uploading.current === 0) onUploadingChangeRef.current?.(false);
        };
        upload(file).then(
          (stored) =>
            finish((pos) =>
              editor.view.dispatch(
                editor.view.state.tr.setNodeMarkup(pos, undefined, {
                  attachmentId: stored.id,
                  alt: stored.name,
                  src: stored.url,
                  status: "ready",
                  uploadId: null,
                }),
              ),
            ),
          (error: unknown) => {
            finish((pos) =>
              editor.view.dispatch(editor.view.state.tr.delete(pos, pos + 1)),
            );
            setImageErrors((current) => [
              ...current,
              `"${file.name}" was not added: ${error instanceof Error ? error.message : "upload failed"}`,
            ]);
          },
        );
      }
      setImageErrors(problems);
    };
  }, [editor]);

  // A value that did not come from this editor replaces the content.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      strike: e?.isActive("strike") ?? false,
      code: e?.isActive("code") ?? false,
      link: e?.isActive("link") ?? false,
      bulletList: e?.isActive("bulletList") ?? false,
      orderedList: e?.isActive("orderedList") ?? false,
    }),
  });

  function openLink() {
    if (!editor) return;
    setLinkUrl((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkError(null);
    setLinkOpen(true);
  }
  useEffect(() => {
    openLinkRef.current = openLink;
  });

  // Focus moves into the link box when it opens (the editor keeps it otherwise, since a shortcut was pressed inside it).
  useEffect(() => {
    if (linkOpen) linkInputRef.current?.focus();
  }, [linkOpen]);

  function closeLink() {
    setLinkOpen(false);
    setLinkError(null);
    editor?.commands.focus();
  }

  function applyLink() {
    if (!editor) return;
    const url = withScheme(linkUrl);
    if (!isSafeLinkUrl(url)) {
      setLinkError("Use an address that starts with https://, http:// or mailto:");
      return;
    }
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !editor.isActive("link")) {
      chain
        .insertContent({
          type: "text",
          text: url,
          marks: [{ type: "link", attrs: { href: url } }],
        })
        .run();
    } else {
      chain.extendMarkRange("link").setLink({ href: url }).run();
    }
    closeLink();
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    closeLink();
  }

  // Place the mention list under the caret (or above when there is more room there).
  const place = useMemo(() => {
    if (!suggest?.rect) return undefined;
    const below = window.innerHeight - suggest.rect.bottom;
    const flip =
      below < Math.min(LIST_MAX_HEIGHT, suggest.items.length * 36 + 12) &&
      suggest.rect.top > below;
    return flip
      ? ({
          position: "fixed",
          left: suggest.rect.left,
          bottom: window.innerHeight - suggest.rect.top + 4,
          minWidth: 200,
        } as const)
      : ({
          position: "fixed",
          left: suggest.rect.left,
          top: suggest.rect.bottom + 4,
          minWidth: 200,
        } as const);
  }, [suggest]);

  const tool = (
    label: string,
    shortcut: string,
    pressed: boolean,
    run: () => void,
    icon: React.ReactNode,
  ) => (
    <IconButton
      key={label}
      label={`${label} (${shortcut})`}
      title={`${label}  ${shortcut}`}
      aria-pressed={pressed}
      disabled={disabled}
      // Pressing a button must not take the selection away from the text it formats.
      onMouseDown={(event) => event.preventDefault()}
      onClick={run}
      className={cn(
        pressed && "bg-[var(--color-border-default)] text-[var(--color-text-default)]",
      )}
    >
      {icon}
    </IconButton>
  );

  return (
    <div className={className}>
      <div
        className={cn(
          "rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-[var(--color-bg-surface)] transition-colors focus-within:border-[var(--color-border-focus)]",
          disabled && "opacity-60",
        )}
      >
        <div
          role="toolbar"
          aria-label="Formatting"
          className="flex flex-wrap items-center gap-0.5 border-b border-[var(--color-border-default)] px-2 py-1"
        >
          {tool(
            "Bold",
            "Ctrl+B",
            state?.bold ?? false,
            () => editor?.chain().focus().toggleBold().run(),
            <Bold size={15} aria-hidden="true" />,
          )}
          {tool(
            "Italic",
            "Ctrl+I",
            state?.italic ?? false,
            () => editor?.chain().focus().toggleItalic().run(),
            <Italic size={15} aria-hidden="true" />,
          )}
          {tool(
            "Strikethrough",
            "Ctrl+Shift+X",
            state?.strike ?? false,
            () => editor?.chain().focus().toggleStrike().run(),
            <Strikethrough size={15} aria-hidden="true" />,
          )}
          {tool(
            "Code",
            "Ctrl+E",
            state?.code ?? false,
            () => editor?.chain().focus().toggleCode().run(),
            <Code size={15} aria-hidden="true" />,
          )}
          {tool(
            "Link",
            "Ctrl+Shift+K",
            state?.link ?? false,
            openLink,
            <Link2 size={15} aria-hidden="true" />,
          )}
          <span
            aria-hidden="true"
            className="mx-1 h-4 w-px bg-[var(--color-border-default)]"
          />
          {tool(
            "Bulleted list",
            "Ctrl+Shift+8",
            state?.bulletList ?? false,
            () => editor?.chain().focus().toggleBulletList().run(),
            <List size={15} aria-hidden="true" />,
          )}
          {tool(
            "Numbered list",
            "Ctrl+Shift+7",
            state?.orderedList ?? false,
            () => editor?.chain().focus().toggleOrderedList().run(),
            <ListOrdered size={15} aria-hidden="true" />,
          )}
        </div>

        {linkOpen && (
          <div
            role="group"
            aria-label="Link"
            className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border-default)] px-2 py-1.5"
          >
            <Input
              ref={linkInputRef}
              type="url"
              inputMode="url"
              placeholder="https://example.com"
              aria-label="Link address"
              aria-invalid={linkError ? true : undefined}
              value={linkUrl}
              onChange={(event) => {
                setLinkUrl(event.target.value);
                setLinkError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation(); // closes only this box, not a side panel behind it
                  closeLink();
                }
              }}
              className="min-w-[12rem] flex-1"
            />
            <Button type="button" size="sm" onClick={applyLink}>
              Apply
            </Button>
            {state?.link && (
              <Button type="button" size="sm" variant="secondary" onClick={removeLink}>
                Remove link
              </Button>
            )}
            <Button type="button" size="sm" variant="secondary" onClick={closeLink}>
              Cancel
            </Button>
            {linkError && (
              <p role="alert" className="w-full text-xs text-[var(--color-text-danger)]">
                {linkError}
              </p>
            )}
          </div>
        )}

        <EditorContent editor={editor} />
      </div>
      {imageErrors.map((message) => (
        <p
          key={message}
          role="alert"
          className="mt-1 flex items-start gap-2 text-xs text-[var(--color-text-danger)]"
        >
          <span className="min-w-0 flex-1">{message}</span>
          <Button
            type="button"
            variant="link"
            onClick={() =>
              setImageErrors((current) => current.filter((m) => m !== message))
            }
          >
            Dismiss
          </Button>
        </p>
      ))}

      {suggest && suggest.items.length > 0 && (
        <div
          style={place}
          // Pressing on a row must not pull focus (and the caret) out of the editor.
          onMouseDown={(event) => event.preventDefault()}
          className="motion-drop-in z-50 rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-1 text-[var(--color-text-default)] shadow-lg"
        >
          <ul
            id={listId}
            role="listbox"
            aria-label="Mention a person"
            className="scrollbar-list-always max-h-56 overflow-y-auto"
          >
            {suggest.items.map((candidate, index) => (
              <li
                key={candidate.id}
                role="option"
                aria-selected={index === suggest.active}
                onMouseMove={() =>
                  suggest.active !== index && setSuggest({ ...suggest, active: index })
                }
                onClick={() =>
                  suggest.command({ id: candidate.id, label: candidate.name })
                }
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-sm",
                  index === suggest.active && "bg-[var(--color-border-default)]",
                )}
              >
                {candidate.icon && (
                  <span aria-hidden="true" className="inline-flex shrink-0 items-center">
                    {candidate.icon}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
