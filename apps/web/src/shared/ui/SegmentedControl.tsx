import { useId } from "react";
import { cn } from "./lib/cn";

/**
 * A short row of exclusive choices drawn as one joined control (the analytics period: 4, 12, 26, 52 weeks). Built on native radio inputs, so the arrow
 * keys, the focus order and the screen reader's "radio group, 2 of 4" all come from the browser; the inputs are visually hidden and each label is
 * the visible segment. Domain-free: the caller supplies the options and what a change does.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  /** Names the group for assistive tech (there is no visible label). */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-[var(--color-bg-surface)] p-0.5 text-sm"
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "cursor-pointer rounded-[var(--radius-control)] px-3 py-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-default)]",
            "has-checked:bg-[var(--color-bg-segment-active)] has-checked:font-medium has-checked:text-[var(--color-text-on-segment-active)]",
            "has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-[var(--color-border-focus)]",
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
