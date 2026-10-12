import { cn } from "./lib/cn";

/**
 * The FlowDesc mark (ADR 0068): the letters F and D in the serif face, a line of flow under them, on a rounded tile. The letters are drawn as
 * outlines (cut from the Newsreader font), so the mark never depends on a font loading. Colors come from tokens: they follow the theme, or, with
 * `onDark`, stay the bright-on-dark pair for a surface that is dark in both themes (the sidebar). Decoration: the name is always written beside it.
 */
const F = "M25.83 26.04V29.98V33.93H24.45L24.13 30.83H16.96V29.13H24.13L24.45 26.04ZM28.02 18.84H28.53L29.41 25.53L28.39 25.65L25.89 20.82L27.71 21.44H16.6V19.72H26.37ZM18.76 19.72V38.42L21.17 39.22V40H13.08V39.22L15.49 38.42V21.3L13.08 20.5V19.72Z";
const D = "M47.3 29.59Q47.3 25.43 44.95 23.45Q42.6 21.46 38.37 21.46H34.13L34.01 19.72H39.14Q43.04 19.72 45.62 20.77Q48.2 21.82 49.49 23.95Q50.78 26.08 50.78 29.29Q50.78 32.7 49.27 35.09Q47.75 37.48 45.12 38.74Q42.49 40 39.14 40H34.01L34.13 38.26H38.75Q41.36 38.26 43.27 37.37Q45.19 36.47 46.24 34.56Q47.3 32.65 47.3 29.59ZM30.24 40V39.22L32.65 38.42V21.3L30.24 20.5V19.72H35.92V40Z";
const WAVE = "M16 48Q22 43 28 48T40 48T48 48";

export function LogoMark({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  const tile = onDark ? "fill-[var(--color-logo-tile-on-dark)]" : "fill-[var(--color-logo-tile)]";
  const ink = onDark ? "fill-[var(--color-logo-ink-on-dark)]" : "fill-[var(--color-logo-ink)]";
  const stroke = onDark ? "stroke-[var(--color-logo-ink-on-dark)]" : "stroke-[var(--color-logo-ink)]";
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={cn("block shrink-0", className)}>
      <rect width="64" height="64" rx="15" className={tile} />
      <path d={F} className={ink} />
      <path d={D} className={ink} />
      <path d={WAVE} fill="none" strokeWidth="3" strokeLinecap="round" opacity=".7" className={stroke} />
    </svg>
  );
}
