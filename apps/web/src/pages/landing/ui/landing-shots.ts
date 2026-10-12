/** The screenshots of the demo organization (taken by `pnpm landing:shots` into `public/landing/`): one per screen and per theme. */
export type ShotView = "board" | "issues" | "analytics";

export const shotSrc = (view: ShotView, theme: "light" | "dark") => `/landing/${view}-${theme}.jpg`;
