import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Dialog } from "../../../shared/ui";
import { CreateSprintForm } from "./CreateSprintForm";

/**
 * "+ New sprint" and the popup it opens (ADR 0065): the form used to sit open above the list all the time. Teal (`create`), like "New issue".
 * It owns the popup's open state; the dialog is only mounted while it is open, and closing it (Esc, the X, Cancel, or a created sprint) gives
 * focus back to this button.
 */
export function NewSprintButton({ organizationId, projectId }: { organizationId: string; projectId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="create" data-tour="new-sprint" className="inline-flex items-center gap-1.5 whitespace-nowrap" onClick={() => setOpen(true)}>
        <Plus size={14} aria-hidden="true" />
        New sprint
      </Button>
      {open && (
        <Dialog title="New sprint" onClose={() => setOpen(false)}>
          <CreateSprintForm organizationId={organizationId} projectId={projectId} onDone={() => setOpen(false)} />
        </Dialog>
      )}
    </>
  );
}
