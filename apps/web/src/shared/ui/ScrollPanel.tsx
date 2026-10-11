import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "./lib/cn";

/**
 * A list that grows inside its own scrolling area instead of stretching the page; "Load more" belongs with it.
 * Both looks keep the surface's own background (no tint) and the slim always-visible scrollbar
 * (`scrollbar-list-always`). The caller sets the height with `className`: a cap (`max-h-[28rem]`), or `min-h-0`
 * inside a column that fills the window. `label` names the area for assistive tech.
 *
 * - (The `raised` look, a thin outline and a soft outer shadow, was the Issues list's; ADR 0036 replaced it with one
 *   bordered surface that holds a header strip and this panel, so it is gone.)
 * - `edges` (a person's activity, an issue's comments and activity): no box. A soft shadow and a thin line fade
 *   in at the top once the list has scrolled and at the bottom while more rows are hidden (`.scroll-edges` in
 *   `app/index.css`; CSS only). Pass `onSurface` when the list sits inside a card, so the edges blend into the
 *   card's colour instead of the page's.
 *
 * `fitWindow`: the cap is also limited to the room left in the window below the box's own top (never under
 * 16rem), so the bottom edge, its shadow and the scrollbar are on screen at rest instead of below the fold,
 * where nothing would show that the list scrolls. Re-measured when the window or the page above changes.
 * `minFit` (default 256px) is that floor: a page whose content above the box is tall (the issue page) passes a larger one, so the box is not squeezed to a
 * sliver and the page scrolls instead. `bottomGap` (default 24px) is the room kept under the box; a page that must not scroll at all passes more than its own bottom padding.
 *
 * `footer` (edges look): content pinned to the bottom of the box, always fully visible however far the list is
 * scrolled (the "Load more" button). The rows scroll underneath it. It sticks at -0.5rem (the box's own bottom
 * padding): sticky offsets count from inside the padding, and at 0 a strip of rows showed under the button.
 */
export function ScrollPanel({
  label,
  look = "edges",
  onSurface = false,
  fitWindow = false,
  bottomGap = 24,
  minFit = 256,
  footer,
  className,
  children,
}: {
  label?: string;
  look?: "edges";
  onSurface?: boolean;
  fitWindow?: boolean;
  bottomGap?: number;
  minFit?: number;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const element = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const node = element.current;
    if (!node || !fitWindow) return;
    const cap = parseFloat(getComputedStyle(node).maxHeight);
    function fit() {
      if (!node) return;
      const top = node.getBoundingClientRect().top + window.scrollY;
      const room = Math.max(window.innerHeight - top - bottomGap, minFit);
      node.style.maxHeight = `${Number.isFinite(cap) ? Math.min(cap, room) : room}px`;
    }
    node.style.maxHeight = "";
    fit();
    // Re-fitting changes this box's height, which can resize the page, which the observer reports again, inside its own callback: the browser then
    // logs "ResizeObserver loop completed with undelivered notifications". Doing the re-fit in the next animation frame breaks that loop.
    let frame = 0;
    const refit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    window.addEventListener("resize", refit);
    const observer = new ResizeObserver(refit);
    observer.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", refit);
      observer.disconnect();
      node.style.maxHeight = "";
    };
  }, [fitWindow, bottomGap, minFit]);

  const style: CSSProperties | undefined =
    look === "edges" && onSurface ? ({ "--edge-bg": "var(--color-bg-surface)" } as CSSProperties) : undefined;
  return (
    <div
      ref={element}
      role={label ? "group" : undefined}
      aria-label={label}
      style={style}
      className={cn(
        "scrollbar-list-always overflow-y-auto",
        "scroll-edges py-2 pr-2 pl-1",
        className,
      )}
    >
      {children}
      {footer && (
        <div className="sticky -bottom-2 -mb-2 bg-[var(--edge-bg,var(--color-bg-page))] pt-2 pb-2">{footer}</div>
      )}
    </div>
  );
}
