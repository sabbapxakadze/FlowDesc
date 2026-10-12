import type { ReactNode } from "react";
import type { Label } from "@flowdesc/contracts";
import { LabelBadge } from "../../../entities/label";
import { useTimezone } from "../../../shared/lib/timezone";
import { useRowMotionProps, type RowState } from "../../../shared/ui";

/** The columns of the Labels list (the header strip uses the same). Below the container width the row stacks: pill, then colour and date, then the buttons. */
export const LABEL_COLUMNS = "@2xl:grid-cols-[minmax(0,1fr)_9rem_8rem_auto]";

/**
 * One label as a row of the single list surface: its pill, its colour (a dot and the hex code) and the day it was made, then the Edit and Delete buttons
 * (`actions`). While it is being edited the row holds `editing` (the inline form) instead. Rows open, flash and close like the other animated lists.
 */
export function LabelRow({
  label,
  state,
  index,
  editing,
  actions,
}: {
  label: Label;
  state: RowState;
  index: number;
  editing: ReactNode | null;
  actions: ReactNode;
}) {
  const timezone = useTimezone();
  const { ref, className, style } = useRowMotionProps<HTMLLIElement>(state, index);
  const created = new Date(label.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: timezone ?? undefined });
  return (
    <li ref={ref} style={style} className={`px-3.5 py-2.5 ${className}`}>
      {editing ?? (
        // Narrow (a phone): the pill on the left with Edit and Delete on the right, always on the same line, and the colour and date as a small line under the pill.
        // Wide: the four columns of the header strip. The meta wrapper becomes `contents` there, so the colour and the date are grid columns of their own.
        <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 ${LABEL_COLUMNS}`}>
          <div className="min-w-0">
            <LabelBadge label={label} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--color-text-muted)] @2xl:contents">
            <span className="flex items-center gap-2 font-mono">
              <span aria-hidden="true" className="h-3 w-3 rounded-full border border-[var(--color-border-default)]" style={{ backgroundColor: label.color }} />
              {label.color.toUpperCase()}
            </span>
            <span>{created}</span>
          </div>
          <div className="col-start-2 row-span-2 row-start-1 flex items-start gap-2 self-start @2xl:col-auto @2xl:row-auto @2xl:row-span-1 @2xl:self-center">{actions}</div>
        </div>
      )}
    </li>
  );
}
