/**
 * Inactivity logout (ADR 0038): after this long without the person touching the page, a dialog warns, and after the
 * warning time more they are signed out. Named in one place so the numbers are easy to change.
 */
export const IDLE_LIMIT_MS = 30 * 60 * 1000;
export const IDLE_WARNING_MS = 60 * 1000;

/** The localStorage key that shares "when did the person last do something" between tabs of the same browser. */
export const LAST_ACTIVITY_KEY = "flowdesc.lastActivity";
