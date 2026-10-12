import { DemoNote } from "../../../features/try-demo";
import { buttonVariants, cn, FadeLink, LogoMark } from "../../../shared/ui";
import { LandingDemoButton } from "./LandingDemoButton";

/** The first thing a visitor reads: what FlowDesc is in one line, and the two ways in. */
export function Hero() {
  return (
    <header className="flex flex-col items-center px-4 pt-12 text-center sm:pt-16">
      <p className="font-display flex items-center gap-3 text-3xl sm:text-4xl">
        <LogoMark className="h-10 w-10 sm:h-12 sm:w-12" />
        FlowDesc
      </p>
      <h1 className="font-display mt-9 max-w-4xl text-[2.75rem] leading-[1.08] font-normal sm:mt-11 sm:text-6xl lg:text-7xl">
        Plan the work. Follow it through.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-[var(--color-text-muted)] sm:text-xl">
        Boards, sprints, issues and analytics, updated live for everyone on your team.
      </p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
        <FadeLink to="/register" className={cn(buttonVariants({ variant: "create" }), "inline-flex h-12 items-center justify-center px-8 text-base font-semibold")}>
          Create account
        </FadeLink>
        <FadeLink to="/login" className={cn(buttonVariants({ variant: "secondary" }), "inline-flex h-12 items-center justify-center bg-[var(--color-bg-surface)] px-8 text-base")}>
          Log in
        </FadeLink>
        <LandingDemoButton />
      </div>
      <DemoNote className="mt-4 max-w-md" />
    </header>
  );
}
