/**
 * "via token" (ADR 0074): the change was made through a personal access token (for example by an AI app), not at the keyboard. It says
 * only that, never which token, because a token's name is its owner's private label.
 */
export function ViaToken() {
  return (
    <span
      title="Made through an access token, for example by an AI app"
      className="inline-block rounded-md border border-[var(--color-border-default)] px-1.5 py-px align-middle text-xs font-normal text-[var(--color-text-muted)]"
    >
      via token
    </span>
  );
}
