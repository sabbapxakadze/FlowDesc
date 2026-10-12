import type { ReactNode } from "react";

/**
 * An on/off switch with its label (the sprints page's "Show done"). A native checkbox with `role="switch"`, visually hidden, so the keyboard
 * (Space), the focus order and the screen reader's "switch, on/off" come from the browser; the track and knob are drawn beside it. Domain-free.
 */
export function Switch({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--color-text-muted)]">
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span
        aria-hidden="true"
        className="relative h-4 w-7 shrink-0 rounded-full bg-[var(--color-chart-quiet)] transition-colors after:absolute after:top-0.5 after:left-0.5 after:h-3 after:w-3 after:rounded-full after:bg-[var(--color-bg-surface)] after:transition-transform peer-checked:bg-[var(--color-bg-segment-active)] peer-checked:after:translate-x-3 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--color-border-focus)]"
      />
      {children}
    </label>
  );
}
