import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useAuth } from "../shared/auth/useAuth";
import { buttonVariants, cn, FadeLink, ThemeSwitch } from "../shared/ui";

/**
 * Layout route for the public auth pages (login, register, verify-email,
 * forgot/reset password, accept invitation), the same pattern as AppShell (ADR 0014): the
 * layout owns the brand and the centered card, each page renders its own
 * <main> inside it. Kept separate from AppShell because these pages are
 * reachable logged out and must never show the app navigation.
 *
 * The look (ADR 0041): a frosted-glass card over three soft, blurred colour shapes. The shapes are decoration (`aria-hidden`, no
 * pointer events, clipped by the page so they never cause sideways scrolling); the card is the translucent `.glass-card` (a plain
 * surface where the browser cannot blur, or less transparency was asked for). On the login and register pages a switch at the top of
 * the card moves between them; the other pages just have the card.
 *
 * The card stays put; only what is inside it fades and rises in (`motion-rise-in`, ADR 0029), keyed by the path like AppShell's pages are,
 * so logging out lands on a login page that arrives instead of popping in, and switching between login and register plays it on the
 * form. Off under reduced motion, like every motion class.
 *
 * The Light / Dark / System switch sits in the top-right corner of every public page (the same shared `ThemeSwitch` the sidebar uses, the
 * choice is remembered in the browser), so people can pick a theme before they ever log in. The top-left corner has a "Home" button back
 * to the public landing page (ADR 0043), the mirror image of the theme switch: transparent until pointed at. Going to the landing page cross-fades.
 */
export function AuthLayout() {
  const { pathname } = useLocation();
  const { forgetSessionEnd } = useAuth();
  // Having arrived here, the person has been told (or not) why; from now on `/` is the landing page again, so Home works after a log out.
  useEffect(() => forgetSessionEnd(), [forgetSessionEnd]);
  const showSwitch = pathname === "/login" || pathname === "/register";
  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-hidden bg-[var(--color-bg-backdrop)] px-4 pt-16 pb-12 sm:justify-center sm:py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        {/* A centred stage, so the shapes reach behind the card at any window size (placed against the window's corners they would not). */}
        <div className="relative h-[40rem] w-[56rem] max-w-full">
          <div className="absolute top-0 left-4 h-80 w-80 rounded-full bg-[var(--color-aurora-1)] opacity-75 blur-[70px] max-sm:h-56 max-sm:w-56" />
          <div className="absolute right-0 bottom-0 h-96 w-96 rounded-full bg-[var(--color-aurora-2)] opacity-75 blur-[70px] max-sm:h-64 max-sm:w-64" />
          <div className="absolute top-24 right-12 h-64 w-64 rounded-full bg-[var(--color-aurora-3)] opacity-60 blur-[70px] max-sm:h-40 max-sm:w-40" />
        </div>
      </div>
      <div className="absolute top-4 left-4 z-10">
        <FadeLink
          to="/"
          className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "inline-flex h-9 items-center gap-1.5 border-transparent bg-transparent px-3")}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Home
        </FadeLink>
      </div>
      <div className="absolute top-4 right-4 z-10">
        <ThemeSwitch />
      </div>
      <FadeLink
        to="/"
        className="relative mb-8 font-display text-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]"
      >
        FlowDesc
      </FadeLink>
      <div className="glass-card relative w-full max-w-sm rounded-[var(--radius-card)] p-6">
        {showSwitch && <AuthSwitch />}
        <div key={pathname} className="motion-rise-in">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

/**
 * "Log in" / "Create account": two links in a segmented control, the current one filled with the create colour. Links, not ARIA tabs,
 * because each is its own address (same reasoning as the List / Board tabs, ADR 0034).
 */
function AuthSwitch() {
  const item = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex-1 rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-center text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-border-focus)]",
      isActive
        ? "bg-[var(--color-bg-action-create)] text-[var(--color-text-on-action-strong)] shadow-sm hover:bg-[var(--color-bg-action-create-hover)]"
        : "text-[var(--color-text-muted)] hover:bg-[var(--color-border-default)] hover:text-[var(--color-text-default)]",
    );
  return (
    <nav
      aria-label="Account"
      className="mb-6 flex gap-1 rounded-[var(--radius-control)] border border-[var(--color-border-default)] p-1"
    >
      <NavLink to="/login" className={item}>
        Log in
      </NavLink>
      <NavLink to="/register" className={item}>
        Create account
      </NavLink>
    </nav>
  );
}
