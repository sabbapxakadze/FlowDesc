import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Link, NavLink, useMatch } from "react-router";
import { useProjects } from "../../entities/project";
import { useMembers, useMyRole } from "../../entities/member";
import { useAuth } from "../../shared/auth/useAuth";
import { isUuid, personPath, projectPath } from "../../shared/lib/paths";
import { useSearchPalette } from "../../shared/search-palette/useSearchPalette";
import { TourButton } from "../../features/app-tour";
import { Avatar, cn, LogoMark, Skeleton, ThemeSwitch } from "../../shared/ui";

const LINK =
  "flex items-center rounded-[var(--radius-control)] px-2.5 py-1.5 text-sm text-[var(--color-text-sidebar)] hover:bg-[var(--color-bg-sidebar-active)] hover:text-[var(--color-text-sidebar-active)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-text-sidebar-active)]";
const LINK_ACTIVE = "bg-[var(--color-bg-sidebar-active)] text-[var(--color-text-sidebar-active)]";

function SideLink({
  to,
  end = false,
  current,
  tour,
  children,
}: {
  to: string;
  end?: boolean;
  /** The guided tour's name for this link (`data-tour`, ADR 0040). */
  tour?: string;
  /**
   * Set only when the URL alone can't say whether this link is "current":
   * the project's Issues link should also light up on an issue page, and
   * the project's own name should never claim the page when its sub-links
   * do. A plain <Link> is used then, so `aria-current` matches what is
   * highlighted (NavLink would derive it from the URL only).
   */
  current?: boolean;
  children: ReactNode;
}) {
  if (current !== undefined) {
    return (
      <Link to={to} data-tour={tour} aria-current={current ? "page" : undefined} className={cn(LINK, current && LINK_ACTIVE)}>
        {children}
      </Link>
    );
  }
  return (
    <NavLink to={to} end={end} data-tour={tour} className={({ isActive }) => cn(LINK, isActive && LINK_ACTIVE)}>
      {children}
    </NavLink>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 mb-1 px-2.5 text-xs font-medium tracking-wide text-[var(--color-text-sidebar)] uppercase opacity-70">
      {children}
    </p>
  );
}

/**
 * The app's persistent navigation. Every link points at a route that
 * already existed; this only makes them reachable from everywhere. The
 * project matching the current URL expands to its pages (Issues, which also
 * holds the Board tab, Sprints, Analytics, Settings), which used to be reachable only through links inside
 * other pages. `actions` is a slot for the caller's buttons (the bell, or the
 * mobile drawer's close button): a widget may not import another widget, so
 * the shell in `app/` supplies it.
 */
export function Sidebar({ actions }: { actions?: ReactNode }) {
  const { user, organization, logout } = useAuth();
  const { data: projects, isPending, isError } = useProjects(organization?.id ?? "", {
    enabled: Boolean(organization),
  });
  // The address names the project by KEY (ADR 0030); an old address may still carry its id for a moment.
  const currentProjectRef = useMatch("/projects/:projectKey/*")?.params.projectKey;
  const onIssuePage = useMatch("/projects/:projectKey/issues/*") !== null;
  const { setOpen: setSearchOpen } = useSearchPalette();
  const role = useMyRole(organization?.id ?? "");
  // Name and photo come from the member list, so an edit shows here without logging in again.
  const { data: members } = useMembers(organization?.id ?? "");
  const me = members?.find((member) => member.userId === user?.id);
  const canManageProject = role === "owner" || role === "admin";
  const onProjectList = useMatch({ path: "/projects/:projectKey", end: true }) !== null;
  const onBoard = useMatch("/projects/:projectKey/board") !== null; // the Board tab of the Issues page (ADR 0034)

  return (
    <div className="flex h-full flex-col gap-1 border-r border-[var(--color-border-sidebar)] bg-[var(--color-bg-sidebar)] p-3">
      <div className="flex items-center justify-between px-1 pb-3">
        <NavLink
          to="/"
          className="font-display inline-flex items-center gap-2.5 text-2xl text-[var(--color-text-sidebar-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-sidebar-active)]"
        >
          <LogoMark onDark className="h-8 w-8" />
          FlowDesc
        </NavLink>
        {actions}
      </div>

      <nav aria-label="Main" className="scrollbar-sidebar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        <SideLink to="/" end tour="my-work">
          My work
        </SideLink>
        <SideLink to="/projects" end>
          Projects
        </SideLink>
        <button
          type="button"
          data-tour="search"
          onClick={() => setSearchOpen(true)}
          className={cn(LINK, "w-full justify-between text-left")}
        >
          <span className="flex items-center gap-2">
            <Search aria-hidden className="h-4 w-4" />
            Search
          </span>
          <kbd className="text-xs opacity-70">Ctrl K</kbd>
        </button>
        <SideLink to="/labels">Labels</SideLink>
        <SideLink to="/members">Members</SideLink>
        {canManageProject && <SideLink to="/audit-log">Audit log</SideLink>}

        <SectionLabel>Your projects</SectionLabel>
        <div data-tour="sidebar-projects" className="flex flex-col gap-0.5">
        {isPending ? (
          <div className="flex flex-col gap-1.5 px-2.5">
            <Skeleton className="h-4 w-full bg-[var(--color-bg-sidebar-active)]" />
            <Skeleton className="h-4 w-2/3 bg-[var(--color-bg-sidebar-active)]" />
          </div>
        ) : isError ? (
          <p className="px-2.5 text-sm text-[var(--color-text-sidebar)]">Could not load projects.</p>
        ) : projects.length === 0 ? (
          <p className="px-2.5 text-sm text-[var(--color-text-sidebar)]">No projects yet.</p>
        ) : (
          projects.map((project) => (
            <div key={project.id} className="flex flex-col gap-0.5">
              <SideLink to={projectPath(project.key)} current={false}>
                <span className="truncate">{project.name}</span>
              </SideLink>
              {currentProjectRef !== undefined &&
                (isUuid(currentProjectRef) ? project.id === currentProjectRef : project.key.toLowerCase() === currentProjectRef.toLowerCase()) && (
                <div className="ml-3 flex flex-col gap-0.5 border-l border-[var(--color-border-sidebar)] pl-2">
                  <SideLink to={projectPath(project.key)} current={onProjectList || onIssuePage || onBoard}>
                    Issues
                  </SideLink>
                  <SideLink to={projectPath(project.key, "sprints")} tour="sprints-link">
                    Sprints
                  </SideLink>
                  <SideLink to={projectPath(project.key, "analytics")} tour="analytics-link">
                    Analytics
                  </SideLink>
                  {canManageProject && (
                    <SideLink to={projectPath(project.key, "settings")}>Settings</SideLink>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        </div>
      </nav>

      <div className="mt-2 flex flex-col gap-0.5 border-t border-[var(--color-border-sidebar)] pt-3">
        <TourButton className={cn(LINK, "w-full text-left")} />
        <SideLink to="/account">Account settings</SideLink>
        <div data-tour="theme-switch" className="px-2.5 pt-2">
          <ThemeSwitch variant="sidebar" />
        </div>
        {user && (
          <div className="flex items-center justify-between gap-2 px-2.5 pt-2 text-sm">
            <NavLink
              to={personPath(me?.name ?? user.name, user.id)}
              className="flex min-w-0 items-center gap-2 rounded-sm text-[var(--color-text-sidebar-active)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-sidebar-active)]"
            >
              <Avatar name={me?.name ?? user.name} src={me?.avatarUrl} size="md" />
              <span className="truncate">{me?.name ?? user.name}</span>
            </NavLink>
            <button
              type="button"
              onClick={logout}
              className="shrink-0 text-[var(--color-text-sidebar)] underline hover:text-[var(--color-text-sidebar-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-sidebar-active)]"
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
