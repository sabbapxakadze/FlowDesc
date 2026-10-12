import { formatDueDate } from "../../../shared/lib/dueDate";

/**
 * What the sprints page writes in words about a sprint's dates. Strings only, so each rule can be checked on its own. The days are plain
 * calendar days ("YYYY-MM-DD"), formatted from the day itself so no timezone can move them (ADR 0032).
 */

/** "Sep 28 - Oct 12", or one end ("Starts Oct 1", "Ends Oct 12"), or "No dates yet": both dates are optional when a sprint is created. */
export function sprintRange(startDate: string | null, endDate: string | null, today: string): string {
  if (startDate && endDate) return `${formatDueDate(startDate, today)} - ${formatDueDate(endDate, today)}`;
  if (startDate) return `Starts ${formatDueDate(startDate, today)}`;
  if (endDate) return `Ends ${formatDueDate(endDate, today)}`;
  return "No dates yet";
}

/** The first letter capital: "ends today" -> "Ends today" (the projects page writes these in lower case, a sprint's header starts a line). */
export function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
