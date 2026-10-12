import { forwardRef, useCallback, useEffect, useRef, type ReactNode } from "react";
import { cn } from "./lib/cn";

/**
 * The panel a list sits in: a board column, or the backlog / active sprint on the sprints page. A shade
 * apart from the page (`--color-bg-lane`) so a short column is still a visible box, with the header kept
 * fixed and the body scrolling inside it with the slim always-visible scrollbar (`scrollbar-list-always`).
 *
 * Size: from the `sm` breakpoint up the lane is as tall as its content, but never taller than the space its
 * parent gives it (`max-h-full`, the parent being a grid row that fills the window), and never shorter than
 * 16rem, so an empty or short column still has room to drop a card into. Past the maximum the body scrolls.
 * On a phone the lanes stack at their natural height and the page scrolls as usual.
 *
 * `freezeHeight` (true while a card is being dragged): a lane may not get SHORTER than it was when the drag
 * began. Without it, picking a card out of a short column shrinks the column under the pointer, and the
 * column the card hovers grows, so the drop targets move while you aim at them. A lane may still grow.
 *
 * `highlighted` marks the lane that currently holds a dragged card. A forwardRef because dnd-kit's
 * `useDroppable` needs the real element. `label` names the lane for assistive tech (a group with that name).
 */
export const Lane = forwardRef<
  HTMLDivElement,
  {
    header: ReactNode;
    label?: string;
    highlighted?: boolean;
    freezeHeight?: boolean;
    /** The `data-tour` name the guided tour points at (shared/tour). */
    tour?: string;
    className?: string;
    children: ReactNode;
  }
>(function Lane({ header, label, highlighted = false, freezeHeight = false, tour, className, children }, ref) {
  const element = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      element.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  // Set straight on the element (no state): it must apply before the next paint of the drag's first frame.
  useEffect(() => {
    const node = element.current;
    if (!node || !freezeHeight) return;
    node.style.minHeight = `${node.getBoundingClientRect().height}px`;
    return () => {
      node.style.minHeight = "";
    };
  }, [freezeHeight]);

  return (
    <div
      ref={setRefs}
      role={label ? "group" : undefined}
      aria-label={label}
      data-tour={tour}
      className={cn(
        "flex flex-col rounded-[var(--radius-card)] bg-[var(--color-bg-lane)] p-2 transition-shadow sm:max-h-full sm:min-h-64 sm:self-start",
        highlighted && "shadow-[inset_0_0_0_2px_var(--color-border-focus)]",
        className,
      )}
    >
      <div className="shrink-0 px-1">{header}</div>
      <div className="scrollbar-list-always sm:min-h-0 sm:flex-1 sm:overflow-y-auto sm:pr-1">{children}</div>
    </div>
  );
});
