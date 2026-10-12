import type { IssuePriority } from "@flowdesc/contracts";

export const PRIORITY_LABELS: Record<IssuePriority, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

/** The order a person expects in a menu: most important first, "none" last. */
export const PRIORITY_ORDER: IssuePriority[] = ["urgent", "high", "medium", "low", "none"];
