/**
 * Days and windows for Ask FlowDesc (ADR 0077). "Today" for a question like "what is overdue?" is the PERSON's day; the site-wide daily budget is the UTC
 * day, because Cloudflare's free allowance resets at 00:00 UTC.
 */

/** The calendar day ("YYYY-MM-DD") it is for someone in this IANA timezone; UTC when there is none or it is not one `Intl` knows. */
export function todayIn(timezone: string | null, now: Date): string {
  try {
    // The "en-CA" locale writes a date as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function secondsUntilNextUtcDay(now: Date): number {
  return Math.max(1, Math.ceil((startOfUtcDay(now).getTime() + 86_400_000 - now.getTime()) / 1000));
}
