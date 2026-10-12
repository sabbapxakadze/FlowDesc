import { useState } from "react";
import { Button } from "./Button";
import { ErrorText } from "./ErrorText";

/**
 * A delete button that asks first, in place: click once to see what will be
 * lost and a confirm button, click again to do it. Inline rather than
 * window.confirm so it can be styled, reached with the keyboard and driven by a
 * test like any other control. Domain-free: the caller supplies the words.
 */
export function ConfirmDelete({
  label,
  message,
  confirmLabel = "Delete",
  onConfirm,
  isPending,
  error,
  startAsking = false,
  onCancel,
}: {
  /** The button that starts it, e.g. "Delete issue". */
  label: string;
  /** What will be lost, shown once the first button is clicked. */
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  isPending?: boolean;
  error?: string | null;
  /** Open already showing the question (the action was chosen from a menu, so the first click has been made). */
  startAsking?: boolean;
  /** Called when the person backs out. */
  onCancel?: () => void;
}) {
  const [asking, setAsking] = useState(startAsking);

  if (!asking) {
    return (
      <Button type="button" variant="danger" size="sm" onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div role="alertdialog" aria-label={label} className="motion-rise-in flex flex-col gap-2">
      <p className="text-sm text-[var(--color-text-default)]">{message}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="dangerStrong"
          disabled={isPending}
          onClick={onConfirm}
        >
          {isPending ? "Deleting…" : confirmLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isPending}
          onClick={() => {
            setAsking(false);
            onCancel?.();
          }}
        >
          Cancel
        </Button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
