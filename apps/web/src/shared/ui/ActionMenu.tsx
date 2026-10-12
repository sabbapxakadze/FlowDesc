import { useCallback, useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { IconButton } from "./IconButton";
import { cn } from "./lib/cn";

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  /** danger draws the label in the danger color (Delete); it is never color alone, the word says it. */
  tone?: "neutral" | "danger";
}

/**
 * A "..." button that opens a short list of actions (the sprint cards' Rename and Delete, ADR 0065). It keeps the quiet things off the
 * card until they are asked for. The list is placed with `position: fixed` from the button's own position, so a scrolling row of cards
 * (which would clip a normally positioned list) cannot cut it off; it closes on a click elsewhere, on a scroll or resize, on Tab, and on
 * Esc, which also returns focus to the button and stays inside the menu (a dialog or side panel behind it keeps its own Esc).
 * Arrow keys, Home and End move between the items. Domain-free: the caller supplies the label and the items.
 */
export function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null);
  const wrapper = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = place !== null;

  const trigger = useCallback(() => wrapper.current?.querySelector<HTMLButtonElement>("button") ?? null, []);
  const close = useCallback(
    (returnFocus: boolean) => {
      setPlace(null);
      if (returnFocus) trigger()?.focus();
    },
    [trigger],
  );

  function toggle() {
    if (open) return close(false);
    const rect = trigger()?.getBoundingClientRect();
    if (rect) setPlace({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !wrapper.current?.contains(target)) setPlace(null);
    };
    const hide = () => setPlace(null);
    document.addEventListener("pointerdown", away);
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, [open]);

  function onKeyDown(event: React.KeyboardEvent) {
    const rows = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next =
        event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : (at + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
      rows[next]?.focus();
    }
  }

  return (
    <span ref={wrapper} className="inline-flex">
      <IconButton label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        <MoreHorizontal size={16} aria-hidden="true" />
      </IconButton>
      {open && place && (
        <div
          ref={menu}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          style={{ top: place.top, right: place.right }}
          className="motion-drop-in fixed z-50 min-w-36 rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-1 text-sm shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setPlace(null);
                item.onSelect();
              }}
              className={cn(
                "block w-full rounded-[var(--radius-control)] px-3 py-1.5 text-left hover:bg-[var(--color-border-default)] focus-visible:bg-[var(--color-border-default)] focus-visible:outline-none",
                item.tone === "danger" ? "text-[var(--color-text-danger)]" : "text-[var(--color-text-default)]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
