import { Mail, Phone, type LucideIcon } from "lucide-react";

const EMAIL = "phkhakadze.saba49@gmail.com";
const PHONE_SHOWN = "+995 591917297";
const PHONE_LINK = "tel:+995591917297";

const CONTACTS: { label: string; value: string; href: string; Icon: LucideIcon }[] = [
  { label: "Email", value: EMAIL, href: `mailto:${EMAIL}`, Icon: Mail },
  { label: "Phone", value: PHONE_SHOWN, href: PHONE_LINK, Icon: Phone },
];

/**
 * Who made it, how to reach them, and the page's last line (ADR 0067). Not a box like the call to action above it: the maker's initials, the
 * name in the serif face, and two contact cards on the page itself, then a thin rule and the copyright. Says only what is true: built by one person.
 */
export function BuiltBy() {
  return (
    <section aria-labelledby="landing-built-by" className="mx-auto mt-20 w-full max-w-6xl px-4 pb-10 sm:mt-28 sm:px-6 sm:pb-12">
      <div className="grid items-center gap-8 md:grid-cols-[1fr_auto] md:gap-12">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left">
          <span
            aria-hidden="true"
            className="font-display flex h-20 w-20 shrink-0 items-center justify-center rounded-[var(--radius-card)] bg-[var(--color-bg-action-create)] text-3xl text-[var(--color-text-on-action-strong)] shadow-lg"
          >
            SP
          </span>
          <div>
            <h2 id="landing-built-by" className="font-display text-3xl leading-tight font-normal sm:text-4xl">
              Built by <span className="text-[var(--color-text-link)]">Saba Pkhakadze</span>
            </h2>
            <p className="mt-2 max-w-md text-base text-[var(--color-text-muted)] sm:text-lg">
              FlowDesc is built end to end by one person. Questions or feedback? Get in touch.
            </p>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
          {CONTACTS.map(({ label, value, href, Icon }) => (
            <li key={label}>
              <a
                href={href}
                className="glass-card group flex items-center gap-3.5 rounded-[var(--radius-card)] px-4 py-3 transition-shadow hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-bg-surface)] text-[var(--color-text-link)]">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs text-[var(--color-text-muted)]">{label}</span>
                  <span className="block truncate font-medium group-hover:underline">{value}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-12 border-t border-[var(--color-border-default)] pt-6 text-center text-sm text-[var(--color-text-muted)]">
        &copy; 2026 FlowDesc. All rights reserved.
      </p>
    </section>
  );
}
