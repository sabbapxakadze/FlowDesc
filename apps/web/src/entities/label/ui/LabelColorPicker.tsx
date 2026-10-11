import { Check } from "lucide-react";
import { LABEL_COLORS } from "../lib/labelColors";

/**
 * A row of preset colours plus the browser's own colour picker for anything else. Controlled: `value` is "#rrggbb" (what the contract
 * accepts), `onChange` gets the new one. The chosen preset shows a tick; a colour that is not a preset leaves them all unticked, and the
 * native picker shows it.
 */
export function LabelColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const current = value.toLowerCase();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        type="color"
        aria-label="Label colour"
        value={current}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-10 cursor-pointer rounded-[var(--radius-control)] border border-[var(--color-border-input)] bg-transparent p-0.5"
      />
      <div
        role="group"
        aria-label="Colour presets"
        className="flex flex-wrap items-center gap-1"
      >
        {LABEL_COLORS.map((color) => (
          <button
            key={color.hex}
            type="button"
            title={color.name}
            aria-label={`Use ${color.name}`}
            aria-pressed={current === color.hex}
            onClick={() => onChange(color.hex)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-white outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]"
            style={{ backgroundColor: color.hex }}
          >
            {current === color.hex && <Check size={14} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  );
}
