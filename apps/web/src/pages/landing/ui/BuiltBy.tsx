import { Mail, Phone } from "lucide-react";
import { buttonVariants, cn } from "../../../shared/ui";

const EMAIL = "phkhakadze.saba49@gmail.com";
const PHONE_SHOWN = "+995 591917297";
const PHONE_LINK = "tel:+995591917297";

/** Who made it, and how to reach them. Says only what is true: built by one person. */
export function BuiltBy() {
  return (
    <section aria-labelledby="landing-built-by" className="mx-auto mt-20 w-full max-w-6xl px-4 pb-16 sm:mt-28 sm:px-6 sm:pb-20">
      <div className="glass-card rounded-[var(--radius-card)] px-6 py-12 text-center sm:px-10 sm:py-14">
        <h2 id="landing-built-by" className="font-display text-3xl leading-tight font-normal sm:text-4xl">
          Built by Saba Pkhakadze
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-[var(--color-text-muted)] sm:text-lg">
          FlowDesc is built end to end by one person. Questions or feedback? Get in touch.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-8">
          <a href={`mailto:${EMAIL}`} className={cn(buttonVariants({ variant: "link" }), "inline-flex items-center gap-2 text-base")}>
            <Mail size={18} aria-hidden="true" />
            {EMAIL}
          </a>
          <a href={PHONE_LINK} className={cn(buttonVariants({ variant: "link" }), "inline-flex items-center gap-2 text-base")}>
            <Phone size={18} aria-hidden="true" />
            {PHONE_SHOWN}
          </a>
        </div>
      </div>
    </section>
  );
}
