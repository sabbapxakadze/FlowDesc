import { ThemeSwitch } from "../../shared/ui";
import { About } from "./ui/About";
import { BuiltBy } from "./ui/BuiltBy";
import { ConnectAi } from "./ui/ConnectAi";
import { FeatureTiles } from "./ui/FeatureTiles";
import { FinalCta } from "./ui/FinalCta";
import { Hero } from "./ui/Hero";
import { HowItWorks } from "./ui/HowItWorks";
import { ProductPreview } from "./ui/ProductPreview";
import { UseCases } from "./ui/UseCases";

/** Where each soft ribbon sits down the page (rem from the top); three colour pairs repeat. Anything past the page's end is clipped. */
const RIBBON_TOPS = [4, 40, 78, 116, 154, 192, 230];
const RIBBON_TONES = ["landing-ribbon-a", "landing-ribbon-b", "landing-ribbon-c"];

/**
 * What a visitor sees at `/` before logging in (ADR 0043): what FlowDesc is, a look at the real app, how it works, what it is used
 * for, and who made it. Rendered by `RequireAuth` for a logged-out visit to `/` only; it is not a route of its own, and it makes no API
 * calls. The look follows the auth pages (ADR 0041): glass surfaces, serif titles, the teal action colour, the theme switch in the
 * corner. The background is a few wide, soft, diagonal ribbons of colour (the same colour tokens as the auth pages' shapes) that run
 * down the whole page.
 */
export function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg-backdrop)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {RIBBON_TOPS.map((top, index) => (
          <div key={top} className={`landing-ribbon ${RIBBON_TONES[index % RIBBON_TONES.length]}`} style={{ top: `${top}rem` }} />
        ))}
      </div>
      <div className="absolute top-4 right-4 z-10">
        <ThemeSwitch />
      </div>
      <main className="motion-rise-in relative">
        <Hero />
        <ProductPreview />
        <About />
        <HowItWorks />
        <FeatureTiles />
        <UseCases />
        <ConnectAi />
        <FinalCta />
        <BuiltBy />
      </main>
    </div>
  );
}
