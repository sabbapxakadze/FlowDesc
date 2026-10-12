import { useEffect, useState, useSyncExternalStore } from "react";
import { Menu, X } from "lucide-react";
import { Outlet, useLocation } from "react-router";
import { FirstTour } from "../features/app-tour";
import { useAuth } from "../shared/auth/useAuth";
import { IconButton } from "../shared/ui";
import { DemoBar } from "../widgets/demo-bar";
import { NotificationBell } from "../widgets/notification-bell";
import { Sidebar } from "../widgets/sidebar";
import { useLiveOrganizationUpdates } from "./useLiveOrganizationUpdates";

const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * Where the current page renders. Keyed by the PATH only, so moving to another page replays the short
 * fade-and-rise (motion-rise-in), while a filter, a sort or the side panel (`?issue=`) changes only the
 * query string and must not replay it. The key also makes React mount the new page fresh, instead of
 * reusing the old page's state when two paths use the same page component (project A's board, then B's).
 */
function PageOutlet() {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="motion-rise-in min-w-0">
      <Outlet />
    </div>
  );
}

// One layout is rendered at a time (not both, hidden with CSS): the bell
// subscribes to live notifications on mount, so mounting two would double
// every listener.
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(DESKTOP_QUERY);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

/**
 * The layout route's element (App.tsx): navigation plus an <Outlet /> for
 * whichever page matched. Pages keep rendering their own <main>, so the
 * shell adds none. Wide screens get a fixed sidebar; narrow screens get a
 * slim top bar whose menu button opens the same sidebar as a drawer.
 */
export function AppShell() {
  return (
    <>
      <FirstTour />
      <AppShellLayout />
    </>
  );
}

function AppShellLayout() {
  const { organization } = useAuth();
  useLiveOrganizationUpdates(organization?.id ?? "");
  const isDesktop = useIsDesktop();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const open = drawerOpen && !isDesktop;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (isDesktop) {
    return (
      <div className="grid min-h-screen grid-cols-[232px_1fr]">
        {/* z-30: a sticky element makes its own stacking context, and without a z-index it
            paints BELOW later positioned content (the charts), hiding the notifications
            dropdown that opens from the sidebar. The side panel (z-40) stays above it. */}
        <div className="sticky top-0 z-30 h-screen">
          <Sidebar actions={<NotificationBell panelAlign="left" />} />
        </div>
        <div className="min-w-0">
          <DemoBar />
          <PageOutlet />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--color-border-sidebar)] bg-[var(--color-bg-sidebar)] px-3 py-2">
        <IconButton
          label="Open menu"
          tone="sidebar"
          size="lg"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={open}
        >
          <Menu size={20} aria-hidden="true" />
        </IconButton>
        <span className="font-display text-xl text-[var(--color-text-sidebar-active)]">FlowDesc</span>
        <div className="ml-auto">
          <NotificationBell panelAlign="right" />
        </div>
      </header>
      <DemoBar />

      {open && (
        <div
          className="fixed inset-0 z-40"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          // A click on any link inside the drawer navigates, so close it.
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setDrawerOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 max-w-[85vw]">
            <Sidebar
              actions={
                <IconButton
                  label="Close menu"
                  tone="sidebar"
                  size="lg"
                  onClick={() => setDrawerOpen(false)}
                  autoFocus
                >
                  <X size={18} aria-hidden="true" />
                </IconButton>
              }
            />
          </div>
        </div>
      )}

      <PageOutlet />
    </div>
  );
}
