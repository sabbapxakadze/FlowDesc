import type { ReactNode } from "react";
import { cn } from "./lib/cn";

/**
 * The muted "nothing here" message shown in place of a list: one place to keep
 * that treatment consistent. The default is one inline line (charts, the bell
 * panel). `block` is for a whole list or drop zone being empty on a data
 * screen: a dashed, padded, centered box that also reads as a drop target.
 * It is a paragraph by default. `as="div"` is for a message made of several paragraphs or with a button in it (a <p> may not
 * contain another <p> or a button: React warns, and the browser re-arranges the markup).
 */
export function EmptyState({
  children,
  className,
  block = false,
  as: Tag = "p",
}: {
  children: ReactNode;
  className?: string;
  block?: boolean;
  as?: "p" | "div";
}) {
  return (
    <Tag
      className={cn(
        "text-[var(--color-text-muted)]",
        block &&
          "rounded-[var(--radius-card)] border border-dashed border-[var(--color-border-input)] px-4 py-6 text-center text-sm",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
