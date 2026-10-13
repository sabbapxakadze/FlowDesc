import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./lib/cn";

export type DropdownOption = {
  value: string;
  label: string;
  /** A small mark before the label: a status dot, a priority icon, an avatar. */
  icon?: ReactNode;
};

/** More options than this get a search box. */
const SEARCH_THRESHOLD = 7;
const LIST_MAX_HEIGHT = 288;

/** An option's mark is decoration: the label is the name (an avatar inside would otherwise be read twice). */
function Mark({ children }: { children: ReactNode }) {
  return children ? (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center">
      {children}
    </span>
  ) : null;
}

/**
 * The app's dropdown (owner's pick D4, 2026-10-05), replacing the browser's `<select>` everywhere: a box that
 * looks like the other controls and a floating list with an optional mark before each label, a search box when
 * the list is long, and the chosen row in the link colour. Controlled: `value` and `onChange(value)`, so a form
 * library uses it through a controller.
 *
 * The standard "select-only combobox" pattern, so it works without a mouse and with a screen reader: the box is a
 * `combobox` button (aria-expanded, aria-controls, aria-activedescendant) and the list a `listbox` of `option`s
 * (aria-selected). Keys: Down/Up open it and move; Home/End jump; Enter or Space choose; Esc closes (and ONLY
 * closes: it does not also close a dialog or side panel behind it); Tab closes and moves on; typing a letter
 * jumps to the next option starting with it (in a searchable list, typing filters instead). Focus stays on the
 * box (or the search box) the whole time, and the list is pointed at with aria-activedescendant.
 *
 * The list is `position: fixed` and placed from the box's measured position (below it, or above when there is
 * more room there), the same way PersonHover's card is, so a scrolling area or a dialog never clips it. It closes
 * on a click outside, on scrolling or resizing the window (its own scrolling excluded).
 *
 * The box is as wide as its widest option (every label is laid out invisibly in the same spot), so choosing
 * another option never makes a row of filters jump. `placeholder` shows when `value` matches no option (the
 * "+ Add label" box, which never keeps a value). Domain-free: the caller supplies options and their marks.
 *
 * `multiple` (the label filter): several options can be chosen at once. The caller passes `values` and `onToggle(value)`
 * instead of `value` and `onChange`; the list stays open while choosing, each chosen row shows a check, the box
 * summarises the choice ("bug +2") and `onClear` adds a "Clear selection" row under the list.
 */
export function Dropdown({
  options,
  value = "",
  onChange,
  multiple = false,
  values = [],
  onToggle,
  onClear,
  id,
  placeholder = "Select…",
  searchable,
  keepOpen = false,
  size = "md",
  quiet = false,
  emptyLabel,
  disabled = false,
  className,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: {
  options: DropdownOption[];
  value?: string;
  onChange?: (value: string) => void;
  /** Several choices at once: use `values`, `onToggle` and (optionally) `onClear` instead of `value` and `onChange`. */
  multiple?: boolean;
  values?: string[];
  onToggle?: (value: string) => void;
  onClear?: () => void;
  id?: string;
  placeholder?: string;
  /** Default: a search box when there are more than 7 options. */
  searchable?: boolean;
  /** Stay open after a choice, for adding several things in one go (the label picker); Esc, a click outside or Tab closes it. */
  keepOpen?: boolean;
  size?: "md" | "sm";
  /**
   * A toolbar look (ADR 0072): no box until you point at it, and it is as wide as what it shows (it does not reserve room for its widest
   * option). Chosen, it turns into the link colour on a faint tint, so the active filters stand out in a row of quiet ones.
   */
  quiet?: boolean;
  /** For `quiet`: the short name shown while nothing is chosen ("Priority"); once something is chosen it reads "Priority: High". */
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<CSSProperties>({});

  const hasSearch = searchable ?? options.length > SEARCH_THRESHOLD;
  const shown = hasSearch ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())) : options;
  const selected = options.find((o) => o.value === value);
  const chosenValues = new Set(values);
  const chosen = multiple ? options.filter((o) => chosenValues.has(o.value)) : [];
  // Something other than "the default" is chosen: a value that is not empty, or at least one of several.
  const hasChoice = multiple ? chosen.length > 0 : value !== "" && selected !== undefined;
  // `quiet` with a name: "Priority" while nothing is chosen, "Priority: High" after.
  const named = quiet && emptyLabel !== undefined;

  function openList() {
    if (disabled) return;
    const box = trigger.current?.getBoundingClientRect();
    if (box) {
      const below = window.innerHeight - box.bottom - 12;
      const above = box.top - 12;
      const up = below < 200 && above > below;
      const room = Math.max(120, Math.min(LIST_MAX_HEIGHT, up ? above : below));
      setPlace({
        position: "fixed",
        left: box.left,
        minWidth: box.width,
        maxHeight: room,
        ...(up ? { bottom: window.innerHeight - box.top + 4 } : { top: box.bottom + 4 }),
      });
    }
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }

  function choose(option: DropdownOption) {
    if (multiple) {
      // Toggling: the list stays open so several can be chosen; the highlight stays where it is.
      onToggle?.(option.value);
      return;
    }
    onChange?.(option.value);
    if (keepOpen) {
      // The chosen row usually leaves the list: keep the highlight on a row that still exists.
      setActive((i) => Math.min(i, Math.max(0, shown.length - 2)));
      return;
    }
    close(true);
  }

  // A search box takes the focus when the list opens; keep the highlighted row in view as it moves.
  useEffect(() => {
    // preventScroll: focusing must never scroll the PAGE (the page scrolling closes the list, see below).
    if (open && hasSearch) searchBox.current?.focus({ preventScroll: true });
  }, [open, hasSearch]);
  useEffect(() => {
    if (!open) return;
    // Keep the highlighted row visible by scrolling the LIST only. scrollIntoView would also scroll the page when the
    // page itself scrolls, and a page scroll closes the list.
    const row = document.getElementById(optionId(active));
    const box = list.current?.querySelector("ul");
    if (!row || !box) return;
    const r = row.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.top < b.top) box.scrollTop -= b.top - r.top;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
  });

  // Close on a click outside, on a scroll elsewhere and on a resize: the fixed list would be left behind.
  useEffect(() => {
    if (!open) return;
    function outside(event: MouseEvent) {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !list.current?.contains(target)) setOpen(false);
    }
    // A scroll that was already under way when the list opened (the page settling after the click scrolled the box into
    // view) reaches us just after it: ignore scrolls for a moment, or the list would close the instant it opens.
    const openedAt = performance.now();
    function scrolled(event: Event) {
      if (performance.now() - openedAt < 150) return;
      if (!list.current?.contains(event.target as Node)) setOpen(false);
    }
    const resized = () => setOpen(false);
    document.addEventListener("mousedown", outside);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", resized);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", resized);
    };
  }, [open]);

  function onKeyDown(event: KeyboardEvent) {
    const onTrigger = event.target === trigger.current;
    if (!open) {
      if (onTrigger && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        openList();
      }
      return;
    }
    switch (event.key) {
      case "Escape":
        // Only the list closes: not the dialog or side panel it sits in.
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      case "Tab":
        setOpen(false);
        return;
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => Math.min(i + 1, shown.length - 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        return;
      case "Home":
        if (!hasSearch) {
          event.preventDefault();
          setActive(0);
        }
        return;
      case "End":
        if (!hasSearch) {
          event.preventDefault();
          setActive(shown.length - 1);
        }
        return;
      case "Enter":
        event.preventDefault();
        if (shown[active]) choose(shown[active]);
        return;
      case " ":
        if (onTrigger) {
          event.preventDefault();
          if (shown[active]) choose(shown[active]);
        }
        return;
    }
    // Type-ahead on a list without a search box: letters typed in quick succession jump to the next match.
    if (!hasSearch && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = event.timeStamp;
      typed.current = { text: (now - typed.current.at > 600 ? "" : typed.current.text) + event.key.toLowerCase(), at: now };
      const from = typed.current.text.length === 1 ? active + 1 : active;
      const order = [...shown.keys()].map((i) => (i + from) % shown.length);
      const hit = order.find((i) => shown[i]!.label.toLowerCase().startsWith(typed.current.text));
      if (hit !== undefined) setActive(hit);
    }
  }

  const sizer: DropdownOption[] = quiet ? [] : options.length > 0 ? [...options] : [{ value: "", label: placeholder }];
  if (!quiet && multiple && options.length > 0) {
    const longest = options.reduce((a, b) => (b.label.length > a.label.length ? b : a));
    sizer.push({ value: "\u0000summary", label: `${longest.label} +9` });
  }
  return (
    <div ref={root} className={cn("relative", className)} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        data-value={multiple ? values.join(",") : value}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && !hasSearch && shown[active] ? optionId(active) : undefined}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        onClick={() => (open ? close(false) : openList())}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-[var(--radius-control)] border text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-border-focus)] disabled:opacity-60 aria-[invalid=true]:border-[var(--color-text-danger)]",
          quiet
            ? cn(
                "gap-1 border-transparent px-2.5",
                named && hasChoice
                  ? "bg-[var(--color-border-default)]/60 font-medium text-[var(--color-text-link)]"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-border-default)]/60 hover:text-[var(--color-text-default)]",
              )
            : "border-[var(--color-border-input)] bg-[var(--color-bg-surface)] px-3 text-[var(--color-text-default)] hover:border-[var(--color-text-muted)] focus:border-[var(--color-border-focus)]",
          size === "sm" ? "py-1" : "py-1.5",
        )}
      >
        <span className="grid min-w-0">
          {/* Every label laid out in the same place, invisible: the box is as wide as the widest one. */}
          {sizer.map((option) => (
            <span key={option.value} aria-hidden="true" className="invisible col-start-1 row-start-1 flex items-center gap-2 whitespace-nowrap">
              {option.icon}
              {option.label}
            </span>
          ))}
          <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-2">
            {multiple && chosen.length > 0 ? (
              <span className="truncate">
                {named ? `${emptyLabel}: ` : ""}
                {chosen[0]!.label}
                {chosen.length > 1 && <span className="text-[var(--color-text-muted)]"> +{chosen.length - 1}</span>}
              </span>
            ) : selected && !multiple && !(named && !hasChoice) ? (
              <>
                <Mark>{selected.icon}</Mark>
                <span className="truncate">
                  {named ? `${emptyLabel}: ` : ""}
                  {selected.label}
                </span>
              </>
            ) : (
              <span className={cn("truncate", !named && "text-[var(--color-text-muted)]")}>{named ? emptyLabel : placeholder}</span>
            )}
          </span>
        </span>
        <ChevronDown
          size={quiet ? 14 : 16}
          aria-hidden="true"
          className={cn("shrink-0 transition-transform", named && hasChoice ? "text-[var(--color-text-link)]" : "text-[var(--color-text-muted)]", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          ref={list}
          style={place}
          // A click inside must not reach an enclosing <label> (which would click the box again), and pressing
          // on a row must not pull focus off the box or the search field.
          onClick={(event) => event.preventDefault()}
          onMouseDown={(event) => {
            if (event.target !== searchBox.current) event.preventDefault();
          }}
          className="motion-drop-in z-50 flex flex-col rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-1 text-[var(--color-text-default)] shadow-lg"
        >
          {hasSearch && (
            <input
              ref={searchBox}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              role="searchbox"
              aria-label="Search options"
              aria-controls={listId}
              aria-activedescendant={shown[active] ? optionId(active) : undefined}
              placeholder="Search…"
              className="mb-1 w-full shrink-0 rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-[var(--color-bg-surface)] px-2 py-1 text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]"
            />
          )}
          <ul
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            aria-multiselectable={multiple || undefined}
            className="scrollbar-list-always min-h-0 overflow-y-auto"
          >
            {shown.map((option, index) => {
              const isSelected = multiple ? chosenValues.has(option.value) : option.value === value;
              return (
                <li
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isSelected}
                  onMouseMove={() => active !== index && setActive(index)}
                  onClick={() => choose(option)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 text-sm",
                    index === active && "bg-[var(--color-border-default)]",
                    isSelected && "font-semibold text-[var(--color-text-link)]",
                  )}
                >
                  <Mark>{option.icon}</Mark>
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {multiple && isSelected && <Check size={14} aria-hidden="true" className="shrink-0" />}
                </li>
              );
            })}
            {shown.length === 0 && (
              <li className="px-2 py-1.5 text-sm text-[var(--color-text-muted)]">
                {options.length === 0 ? "Nothing to choose" : "No matches"}
              </li>
            )}
          </ul>
          {multiple && values.length > 0 && onClear && (
            <button
              type="button"
              onClick={() => onClear()}
              className="mt-1 w-full shrink-0 rounded-[var(--radius-control)] px-2 py-1 text-left text-xs text-[var(--color-text-link)] hover:bg-[var(--color-border-default)]"
            >
              Clear selection ({values.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
