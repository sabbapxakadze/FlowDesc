// The entity's domain type *is* the shared contract type — no duplicate
// hand-written interface. If the API's shape changes, this breaks at
// compile time instead of drifting silently. See ADR 0002.
export type { Project } from "@flowdesc/contracts";
