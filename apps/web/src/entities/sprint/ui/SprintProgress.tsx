/**
 * One thin bar split by status: done (green), in progress (teal), to do (grey), the same status colors the issue badges use (they redefine
 * in dark mode). A decoration for the numbers printed next to it, so it is hidden from assistive tech; a part with no issues takes no room.
 * Shown on the active sprint's card and in the active sprint's summary (ADR 0065).
 */
export function SprintProgress({ done, inProgress, todo }: { done: number; inProgress: number; todo: number }) {
  const parts = [
    { count: done, color: "var(--color-status-done)" },
    { count: inProgress, color: "var(--color-status-in-progress)" },
    { count: todo, color: "var(--color-status-todo)" },
  ].filter((part) => part.count > 0);
  return (
    <div aria-hidden="true" className="flex h-1.5 gap-0.5">
      {parts.length === 0 ? (
        <div className="flex-1 rounded-full bg-[var(--color-chart-quiet)]" />
      ) : (
        parts.map((part) => <div key={part.color} style={{ flexGrow: part.count, backgroundColor: part.color }} className="min-w-1 rounded-full" />)
      )}
    </div>
  );
}
