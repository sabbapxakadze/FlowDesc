import { useState } from "react";
import { Columns3, List, Pencil, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import type { IssueStatus } from "@flowdesc/contracts";
import { IssueCardContent, IssueCardFrame } from "../../entities/issue";
import { LabelPills } from "../../entities/label";
import { ProviderButton } from "../../entities/oauth";
import { CommentEditorDemo } from "./CommentEditorDemo";
import {
  Avatar,
  Button,
  buttonVariants,
  Card,
  ColumnHeader,
  EmptyState,
  ErrorText,
  Dialog,
  Dropdown,
  Field,
  IconButton,
  Input,
  PasswordInput,
  Lane,
  Page,
  PageHeader,
  PRIORITY_OPTIONS,
  ScrollPanel,
  SidePanel,
  Skeleton,
  STATUS_OPTIONS,
  StatusBadge,
  Textarea,
  ThemeSwitch,
  ViewTabs,
} from "../../shared/ui";

type SwatchKind = "fill" | "text" | "border";

type Token = {
  name: string;
  cssVar: string;
  kind: SwatchKind;
  /** For a text token: the background it is drawn on (defaults to bg-surface). */
  on?: string;
};

type TokenGroup = { title: string; note?: string; tokens: Token[] };

/**
 * Hardcoded, not parsed from semantic.css at runtime: the list is small and a
 * drift between it and the real token file is a visible diff to catch in
 * review. Swatches are styled with an inline `var(--token)`, so this page
 * needs no Tailwind class lookup tables for tokens (the two primitive scales
 * below still do, because Tailwind must see their class names).
 */
const TOKEN_GROUPS: TokenGroup[] = [
  {
    title: "Surfaces and text",
    tokens: [
      { name: "bg-page", cssVar: "--color-bg-page", kind: "fill" },
      { name: "bg-backdrop", cssVar: "--color-bg-backdrop", kind: "fill" },
      { name: "bg-surface", cssVar: "--color-bg-surface", kind: "fill" },
      { name: "bg-action-primary", cssVar: "--color-bg-action-primary", kind: "fill" },
      { name: "bg-action-success", cssVar: "--color-bg-action-success", kind: "fill" },
      { name: "bg-action-create", cssVar: "--color-bg-action-create", kind: "fill" },
      { name: "bg-action-danger", cssVar: "--color-bg-action-danger", kind: "fill" },
      { name: "bg-action-danger-strong", cssVar: "--color-bg-action-danger-strong", kind: "fill" },
      { name: "text-default", cssVar: "--color-text-default", kind: "text" },
      { name: "text-muted", cssVar: "--color-text-muted", kind: "text" },
      { name: "text-link", cssVar: "--color-text-link", kind: "text" },
      { name: "text-danger", cssVar: "--color-text-danger", kind: "text" },
      { name: "text-warning", cssVar: "--color-text-warning", kind: "text" },
      {
        name: "text-on-action",
        cssVar: "--color-text-on-action",
        kind: "text",
        on: "--color-bg-action-primary",
      },
      {
        name: "text-on-action-strong",
        cssVar: "--color-text-on-action-strong",
        kind: "text",
        on: "--color-bg-action-success",
      },
    ],
  },
  {
    title: "Borders",
    note: "border-input is the control boundary: measured at 3:1 or better against the surface in both modes (ADR 0015).",
    tokens: [
      { name: "border-default", cssVar: "--color-border-default", kind: "border" },
      { name: "border-input", cssVar: "--color-border-input", kind: "border" },
      { name: "border-focus", cssVar: "--color-border-focus", kind: "border" },
    ],
  },
  {
    title: "Status",
    note: "A fixed three-state enum, never the only carrier of meaning: every use also shows a label.",
    tokens: [
      { name: "status-todo", cssVar: "--color-status-todo", kind: "fill" },
      { name: "status-in-progress", cssVar: "--color-status-in-progress", kind: "fill" },
      { name: "status-done", cssVar: "--color-status-done", kind: "fill" },
    ],
  },
  {
    title: "Timeline events",
    note: "The dot before each activity line on an issue. Status changes use the status colours.",
    tokens: [
      { name: "event-added", cssVar: "--color-event-added", kind: "fill" },
      { name: "event-removed", cssVar: "--color-event-removed", kind: "fill" },
      { name: "event-changed", cssVar: "--color-event-changed", kind: "fill" },
    ],
  },
  {
    title: "Charts",
    tokens: [
      { name: "chart-primary", cssVar: "--color-chart-primary", kind: "fill" },
      { name: "chart-grid", cssVar: "--color-chart-grid", kind: "fill" },
      { name: "chart-axis", cssVar: "--color-chart-axis", kind: "fill" },
    ],
  },
  {
    title: "Navigation shell",
    note: "Dark in light mode on purpose (ADR 0014); separated by a border in dark mode.",
    tokens: [
      { name: "bg-sidebar", cssVar: "--color-bg-sidebar", kind: "fill" },
      { name: "bg-sidebar-active", cssVar: "--color-bg-sidebar-active", kind: "fill" },
      { name: "border-sidebar", cssVar: "--color-border-sidebar", kind: "border" },
      { name: "text-sidebar", cssVar: "--color-text-sidebar", kind: "text", on: "--color-bg-sidebar" },
      {
        name: "text-sidebar-active",
        cssVar: "--color-text-sidebar-active",
        kind: "text",
        on: "--color-bg-sidebar-active",
      },
    ],
  },
];

const ACCENT_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const NEUTRAL_SHADES = [50, 100, 200, 300, 400, 450, 500, 600, 700, 800, 900, 950] as const;

/** Literal, complete class strings: Tailwind's scanner reads source text, so a
 * template literal built from the shade would never be generated. */
const accentBgClassByShade: Record<(typeof ACCENT_SHADES)[number], string> = {
  50: "bg-accent-50",
  100: "bg-accent-100",
  200: "bg-accent-200",
  300: "bg-accent-300",
  400: "bg-accent-400",
  500: "bg-accent-500",
  600: "bg-accent-600",
  700: "bg-accent-700",
  800: "bg-accent-800",
  900: "bg-accent-900",
  950: "bg-accent-950",
};

const neutralBgClassByShade: Record<(typeof NEUTRAL_SHADES)[number], string> = {
  50: "bg-neutral-50",
  100: "bg-neutral-100",
  200: "bg-neutral-200",
  300: "bg-neutral-300",
  400: "bg-neutral-400",
  450: "bg-neutral-450",
  500: "bg-neutral-500",
  600: "bg-neutral-600",
  700: "bg-neutral-700",
  800: "bg-neutral-800",
  900: "bg-neutral-900",
  950: "bg-neutral-950",
};

const ALL_STATUSES: IssueStatus[] = ["todo", "in_progress", "done"];

function TokenSwatch({ token }: { token: Token }) {
  return (
    <div className="flex items-center gap-3">
      {token.kind === "fill" && (
        <div
          className="h-10 w-10 shrink-0 rounded-[var(--radius-control)] border border-[var(--color-border-default)]"
          style={{ background: `var(${token.cssVar})` }}
        />
      )}
      {token.kind === "text" && (
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-default)]"
          style={{ background: `var(${token.on ?? "--color-bg-surface"})` }}
        >
          <span className="font-medium" style={{ color: `var(${token.cssVar})` }}>
            Aa
          </span>
        </div>
      )}
      {token.kind === "border" && (
        <div
          className="h-10 w-10 shrink-0 rounded-[var(--radius-control)] border-2 bg-[var(--color-bg-surface)]"
          style={{ borderColor: `var(${token.cssVar})` }}
        />
      )}
      <div className="text-sm">
        <p className="font-medium">{token.name}</p>
        <p className="text-[var(--color-text-muted)]">{token.cssVar}</p>
      </div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-1 text-lg font-semibold">{title}</h2>
      {note && <p className="mb-3 text-sm text-[var(--color-text-muted)]">{note}</p>}
      {!note && <div className="mb-3" />}
      {children}
    </section>
  );
}

function DemoActivityRow({ i }: { i: number }) {
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-border-default)]">
        <Pencil size={14} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">changed the status of WEB-{i + 1} Fix the footer</span>
      <span className="shrink-0 text-xs text-[var(--color-text-muted)]">{i + 1}h ago</span>
    </li>
  );
}

function ScrollPanelDemo() {
  return (
    <div className="grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-2">
      <div>
        <p className="mb-2 text-sm font-medium">look="edges" in a bordered surface with its own header (the Issues list)</p>
        <div className="flex h-72 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          <div className="border-b border-[var(--color-border-default)] bg-[var(--color-border-default)]/30 px-3.5 py-1.5 text-xs text-[var(--color-text-muted)]">Issue</div>
          <ScrollPanel label="Tray demo" onSurface className="min-h-0 flex-1 p-0">
            <ul>
              {Array.from({ length: 9 }, (_, i) => (
                <li key={i} className="border-t border-[var(--color-border-default)] px-3.5 py-2.5 first:border-t-0 hover:bg-[var(--color-border-default)]/40">
                  <p className="font-medium">Fix the footer layout</p>
                  <p className="text-xs text-[var(--color-text-muted)]">WEB-{i + 1}</p>
                </li>
              ))}
            </ul>
            <Button variant="secondary" size="sm" className="m-3">Load more</Button>
          </ScrollPanel>
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">look="edges" onSurface (a person's activity, in a card)</p>
        <Card className="p-5">
          <p className="mb-3 text-sm font-semibold">Recent activity</p>
          <ScrollPanel label="Edges demo" look="edges" onSurface className="h-60">
            <ul className="flex flex-col gap-3">
              {Array.from({ length: 9 }, (_, i) => <DemoActivityRow key={i} i={i} />)}
            </ul>
            <Button variant="secondary" size="sm" className="mt-3">Load more</Button>
          </ScrollPanel>
        </Card>
      </div>
    </div>
  );
}

function DemoEditForm({ onCancel }: { onCancel: () => void }) {
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("high");
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <Field label="Title">
        <Input defaultValue="Fix the footer layout" />
      </Field>
      <Field label="Description">
        <Textarea rows={3} defaultValue="The footer overlaps the content on narrow screens." />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Status">
          <Dropdown value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        </Field>
        <Field label="Priority">
          <Dropdown value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
        </Field>
        <Field label="Assignee">
          <Dropdown value="me" onChange={() => undefined} options={[{ value: "me", label: "Assigned to me" }]} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  );
}

function DialogDemo() {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" onClick={() => setOpen(true)}>
        Open a dialog
      </Button>
      <Button type="button" variant="secondary" data-panel-trigger onClick={() => setPanel(true)}>
        Open a side panel, then Edit (the dialog opens on top)
      </Button>
      {open && (
        <Dialog title="Edit WEB-1" onClose={() => setOpen(false)}>
          <DemoEditForm onCancel={() => setOpen(false)} />
        </Dialog>
      )}
      {panel && (
        <SidePanel label="Issue" onClose={() => setPanel(false)}>
          <div className="p-5">
            <h3 className="font-display text-xl">Fix the footer layout</h3>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">WEB-1, Todo, High, assigned to me.</p>
            <Button type="button" variant="link" className="mt-3" onClick={() => setOpen(true)}>
              Edit
            </Button>
          </div>
        </SidePanel>
      )}
    </div>
  );
}

const DEMO_PEOPLE = ["Ada Lovelace", "Grace Hopper", "Alan Turing", "Katherine Johnson", "Linus Torvalds", "Margaret Hamilton", "Dennis Ritchie", "Barbara Liskov"];

const DEMO_LABEL_OPTIONS = [
  { id: "1", name: "bug", color: "#b91c1c" },
  { id: "2", name: "design", color: "#6d28d9" },
  { id: "3", name: "tech-debt", color: "#475569" },
  { id: "4", name: "docs", color: "#15803d" },
];

function LabelPillsDemo() {
  const [active, setActive] = useState<string[]>(["1"]);
  const toggle = (id: string) => setActive((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  return (
    <div className="flex max-w-md flex-col gap-4">
      <div>
        <p className="mb-1 text-sm font-medium">Pills that filter (on a card): click to choose, again to remove</p>
        <LabelPills labels={DEMO_LABEL_OPTIONS} activeIds={active} onToggle={toggle} />
      </div>
      <div>
        <p className="mb-1 text-sm font-medium">Plain pills (more than three: +n)</p>
        <LabelPills labels={DEMO_LABEL_OPTIONS} />
      </div>
      <div>
        <p className="mb-1 text-sm font-medium">Several at once in a dropdown (the label filter)</p>
        <Dropdown
          aria-label="Labels demo"
          multiple
          placeholder="All labels"
          values={active}
          onToggle={toggle}
          onClear={() => setActive([])}
          options={DEMO_LABEL_OPTIONS.map((l) => ({ value: l.id, label: l.name, icon: <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} /> }))}
        />
      </div>
    </div>
  );
}

function DropdownDemo() {
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("high");
  const [person, setPerson] = useState("");
  const [placeholderValue, setPlaceholderValue] = useState("");
  return (
    <div className="grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
      <Field label="Status">
        <Dropdown value={status} onChange={setStatus} options={STATUS_OPTIONS} />
      </Field>
      <Field label="Priority">
        <Dropdown value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
      </Field>
      <Field label="Assignee (eight people: has a search box)">
        <Dropdown
          value={person}
          onChange={setPerson}
          options={[
            { value: "", label: "Unassigned" },
            ...DEMO_PEOPLE.map((name) => ({ value: name, label: name, icon: <Avatar name={name} size="sm" /> })),
          ]}
        />
      </Field>
      <Field label="With a placeholder (nothing chosen)">
        <Dropdown
          value={placeholderValue}
          onChange={setPlaceholderValue}
          placeholder="+ Add label"
          options={[
            { value: "bug", label: "bug" },
            { value: "design", label: "design" },
          ]}
        />
      </Field>
      <Field label="Disabled">
        <Dropdown value="member" onChange={() => undefined} disabled options={[{ value: "member", label: "Member" }]} />
      </Field>
    </div>
  );
}

const DEMO_CARDS: { title: string; status: IssueStatus }[] = [
  { title: "Fix the footer", status: "todo" },
  { title: "Dark mode contrast", status: "in_progress" },
  { title: "Write the README", status: "todo" },
  { title: "Ship the login page", status: "done" },
];

function DemoViewBody({ view }: { view: "list" | "board" }) {
  return view === "list" ? (
    <ul className="flex flex-col gap-2">
      {DEMO_CARDS.map((card) => (
        <li key={card.title} className="flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--color-border-default)] px-3 py-2 text-sm">
          {card.title}
          <StatusBadge status={card.status} />
        </li>
      ))}
    </ul>
  ) : (
    <div className="grid grid-cols-3 gap-3">
      {(["todo", "in_progress", "done"] as const).map((status) => (
        <div key={status} className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-[var(--color-bg-lane)] p-2">
          <StatusBadge status={status} />
          {DEMO_CARDS.filter((card) => card.status === status).map((card) => (
            <div key={card.title} className="rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm">
              {card.title}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The real `ViewTabs` in a header, once per state (the app's own router decides in the app; here `current` is set by hand). */
function ViewTabsDemo() {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {(["list", "board"] as const).map((view) => (
        <Card key={view} className="p-4">
          <PageHeader
            eyebrow="Website"
            title={view === "list" ? "Issues" : "Board"}
            aside={
              <ViewTabs
                label={`Demo view, ${view}`}
                items={[
                  { to: "/design-system", label: "List", Icon: List, current: view === "list" },
                  { to: "/design-system", label: "Board", Icon: Columns3, current: view === "board" },
                ]}
              />
            }
          />
          <DemoViewBody view={view} />
        </Card>
      ))}
    </div>
  );
}

const DEMO_CARD_LABELS = [
  { id: "d1", name: "bug", color: "#b91c1c" },
  { id: "d2", name: "payments", color: "#7e22ce" },
];

/** The board card's face (ADR 0037) for each priority; the card in the app adds the grip, the link and the assignee around it. */
function IssueCardDemo() {
  const samples = [
    { priority: "urgent", title: "Fix the checkout total rounding", dueDate: "2020-01-02", labels: DEMO_CARD_LABELS },
    { priority: "high", title: "Ship the login page", dueDate: null, labels: DEMO_CARD_LABELS.slice(0, 1) },
    { priority: "medium", title: "Write the onboarding guide", dueDate: null, labels: [] },
    { priority: "low", title: "Audit log retention", dueDate: null, labels: DEMO_CARD_LABELS.slice(1) },
    { priority: "none", title: "A card with no priority has no edge and no footer", dueDate: null, labels: [] },
  ] as const;
  return (
    <div className="grid max-w-3xl grid-cols-1 gap-2 sm:grid-cols-2">
      {samples.map((sample, index) => (
        <IssueCardFrame key={sample.priority} priority={sample.priority}>
          <IssueCardContent
            issue={{ number: index + 1, title: sample.title, priority: sample.priority, dueDate: sample.dueDate, status: "todo", labels: [...sample.labels] }}
            projectKey="WEB"
            labels={<LabelPills labels={[...sample.labels]} variant="outline" className="" />}
          />
        </IssueCardFrame>
      ))}
    </div>
  );
}

function Scale({ shades, classes, label }: { shades: readonly number[]; classes: Record<number, string>; label: string }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <div className="flex flex-wrap gap-2">
        {shades.map((shade) => (
          <div key={shade} className="text-center text-xs">
            <div className={`mb-1 h-10 w-10 rounded-[var(--radius-control)] ${classes[shade]}`} />
            {shade}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Public: this documents the UI system, not app data, and "portfolio
 * material" (ADR 0006's own phrase) means someone without an account should be
 * able to see it. See App.tsx: not wrapped in RequireAuth, so no sidebar.
 *
 * The theme switch is the same shared ThemeSwitch the sidebar uses, so this
 * page and the app can never disagree about the theme.
 */
export function DesignSystemPage() {
  const [showFieldError, setShowFieldError] = useState(false);

  return (
    <Page>
      <PageHeader title="Design system">
        <p className="mb-3 text-sm text-[var(--color-text-muted)]">
          Every semantic token and base component, live. Switch the theme here or in the sidebar, or
          leave it on System to follow your device.
        </p>
        <ThemeSwitch />
      </PageHeader>

      <h2 className="mb-6 border-b border-[var(--color-border-default)] pb-2 text-sm font-semibold tracking-wide text-[var(--color-text-muted)] uppercase">
        Foundations
      </h2>

      {TOKEN_GROUPS.map((group) => (
        <Section key={group.title} title={group.title} note={group.note}>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.tokens.map((token) => (
              <TokenSwatch key={token.cssVar} token={token} />
            ))}
          </div>
        </Section>
      ))}

      <Section
        title="Primitive scales"
        note="Components never use these directly; the semantic tokens above point at them. Swapping a palette means repointing tokens or editing these ramps."
      >
        <div className="flex flex-col gap-4">
          <Scale shades={NEUTRAL_SHADES} classes={neutralBgClassByShade} label="Neutral gray (450 is FlowDesc's added stop)" />
          <Scale shades={ACCENT_SHADES} classes={accentBgClassByShade} label="Accent: slate-teal (FlowDesc's own)" />
        </div>
      </Section>

      <Section title="Typography" note="Inter for everything you read and scan; Newsreader only for page titles and big numbers, at normal weight.">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Display: Newsreader, 3xl, normal</p>
            <p className="font-display text-3xl font-normal">Projects and 3.5 days</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Section heading: Inter, lg, semibold</p>
            <p className="text-lg font-semibold">Where the work is</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Body: Inter, base</p>
            <p>Issues move from Todo to Done as the sprint progresses.</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Small and meta: Inter, sm and xs, muted</p>
            <p className="text-sm text-[var(--color-text-muted)]">Analytics Demo, ANL-29</p>
          </div>
        </div>
      </Section>

      <Section title="Radius tokens">
        <div className="flex gap-6">
          <div className="text-sm">
            <div className="mb-2 h-16 w-16 rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]" />
            <p className="font-medium">radius-card</p>
            <p className="text-[var(--color-text-muted)]">--radius-card</p>
          </div>
          <div className="text-sm">
            <div className="mb-2 h-16 w-16 rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]" />
            <p className="font-medium">radius-control</p>
            <p className="text-[var(--color-text-muted)]">--radius-control</p>
          </div>
        </div>
      </Section>

      <h2 className="mt-12 mb-6 border-b border-[var(--color-border-default)] pb-2 text-sm font-semibold tracking-wide text-[var(--color-text-muted)] uppercase">
        Components
      </h2>

      <Section title="Button">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="md">
            Primary md
          </Button>
          <Button variant="primary" size="sm">
            Primary sm
          </Button>
          <Button variant="secondary" size="md">
            Secondary md
          </Button>
          <Button variant="secondary" size="sm">
            Secondary sm
          </Button>
          <Button variant="primary" size="md" disabled>
            Disabled
          </Button>
        </div>
        <p className="mt-4 mb-2 text-sm text-[var(--color-text-muted)]">
          Create (New issue, teal), success (Save) and danger (Delete): the red is the first click of a delete, the stronger
          red is the final confirm.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="create" size="sm">
            New issue
          </Button>
          <Button variant="success" size="sm">
            Save
          </Button>
          <Button variant="danger" size="sm">
            Delete
          </Button>
          <Button variant="dangerStrong" size="sm">
            Delete project
          </Button>
        </div>
        <div className="mt-3 max-w-sm">
          <Button fullWidth>Full width</Button>
        </div>
        <p className="mt-4 mb-2 text-sm text-[var(--color-text-muted)]">
          Link: text that acts (Edit, Remove, "View as table"). For a router Link or an anchor, use
          buttonVariants({"{ variant: \"link\" }"}) so it looks the same.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="link">Edit</Button>
          <Button variant="link" disabled>
            Disabled link
          </Button>
          <a href="#link-variant" className={buttonVariants({ variant: "link" })}>
            An anchor with the link look
          </a>
        </div>
        <p className="mt-4 mb-2 text-sm text-[var(--color-text-muted)]">
          IconButton: a button that is only an icon. The label is required (it is the accessible
          name). Tones: neutral, danger, sidebar.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <IconButton label="Edit (neutral)">
            <Pencil size={14} aria-hidden="true" />
          </IconButton>
          <IconButton label="Delete (danger)" tone="danger">
            <Trash2 size={14} aria-hidden="true" />
          </IconButton>
          <IconButton label="Close, large" size="lg">
            <X size={18} aria-hidden="true" />
          </IconButton>
          <span className="rounded-[var(--radius-control)] bg-[var(--color-bg-sidebar)] p-1">
            <IconButton label="Menu (sidebar)" tone="sidebar" size="lg">
              <X size={18} aria-hidden="true" />
            </IconButton>
          </span>
        </div>
      </Section>

      <Section title="Input, Textarea">
        <div className="flex max-w-sm flex-col gap-3">
          <Input placeholder="A text input" />
          <Input placeholder="Invalid (aria-invalid)" aria-invalid="true" />
          <Input placeholder="Disabled" disabled />
          <Field label="Password (PasswordInput: the eye shows or hides it)">
            <PasswordInput placeholder="A password" />
          </Field>
          <Textarea placeholder="A textarea (resizable only up and down, between 4.5rem and 16rem tall)" rows={3} />
        </div>
      </Section>

      <Section title="Sign-in buttons" note="ProviderButton: the Continue with Google / GitHub buttons of the auth pages (the real ones appear only for providers the server has switched on).">
        <div className="flex max-w-sm flex-col gap-2.5">
          <ProviderButton provider="google" />
          <ProviderButton provider="github" />
          <ProviderButton provider="google" pending />
        </div>
      </Section>

      <Section title="Field">
        <div className="flex max-w-sm flex-col gap-3">
          <Field label="Clean field">
            <Input placeholder="No error" />
          </Field>
          <Field
            label="Field with an error"
            error={showFieldError ? "This is what a validation error looks like." : undefined}
          >
            <Input
              placeholder="Focus me to show the error"
              aria-invalid={showFieldError ? true : undefined}
              onFocus={() => setShowFieldError(true)}
            />
          </Field>
        </div>
      </Section>

      <Section title="Card">
        <Card className="max-w-sm">
          <p className="font-medium">A card</p>
          <p className="text-sm text-[var(--color-text-muted)]">
            The elevated container used for list items and boxed content: a surface and a soft shadow, no border.
          </p>
        </Card>
      </Section>

      <Section title="Avatar" note="A photo when there is one, initials otherwise (or when the picture fails to load).">
        <div className="flex flex-wrap items-end gap-6">
          {(["sm", "md", "lg", "xl"] as const).map((size) => (
            <div key={size} className="flex flex-col items-center gap-2">
              <Avatar name="Second Member" size={size} />
              <span className="text-xs text-[var(--color-text-muted)]">{size}</span>
            </div>
          ))}
          <div className="flex flex-col items-center gap-2">
            <Avatar name="Second Member" src="/nonexistent.png" size="lg" />
            <span className="text-xs text-[var(--color-text-muted)]">broken photo</span>
          </div>
        </div>
      </Section>

      <Section title="Status and column headers">
        <div className="flex flex-wrap items-start gap-8">
          <div className="flex flex-col gap-2">
            {ALL_STATUSES.map((status) => (
              <StatusBadge key={status} status={status} />
            ))}
          </div>
          <div>
            <ColumnHeader status="todo" count={3} />
            <ColumnHeader status="in_progress" count={12} />
            <ColumnHeader label="Backlog" count={40} />
          </div>
        </div>
      </Section>

      <Section title="Empty and loading states">
        <div className="flex max-w-sm flex-col gap-3">
          <EmptyState>Inline: a short message in place of a list.</EmptyState>
          <EmptyState block>Block: a whole list or drop zone is empty.</EmptyState>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
      </Section>

      <Section title="ErrorText">
        <ErrorText>This is a standalone mutation-level error message.</ErrorText>
      </Section>

      <Section
        title="Lane"
        note="The panel a board column or a sprints-page list sits in: a shade apart from the page (--color-bg-lane; lighter than the cards in dark mode, so they sit in it like wells), a fixed header, and a body that scrolls inside with the slim always-visible scrollbar. Chosen by the owner in the scroll design pass (2026-10-04)."
      >
        <div className="grid max-w-3xl grid-cols-2 gap-4" style={{ height: "280px" }}>
          {["Todo", "In progress"].map((label, column) => (
            <Lane key={label} header={<ColumnHeader label={label} count={12} />}>
              <ul className="flex flex-col gap-2">
                {Array.from({ length: 8 }, (_, i) => (
                  <Card key={i} as="li">
                    <p className="text-xs text-[var(--color-text-muted)]">DEMO-{column * 20 + i + 1}</p>
                    <p className="font-medium">A card in the lane</p>
                  </Card>
                ))}
              </ul>
            </Lane>
          ))}
        </div>
      </Section>

      <Section
        title="ScrollPanel"
        note="A list that grows inside its own scrolling area instead of stretching the page, with the slim always-visible scrollbar. Both looks keep the surface's own background. Raised: a thin outline and a soft outer shadow, so the list floats above the page; used by the Issues list (the owner tried a pressed-in version first and did not like it). Edges: no box; a soft shadow and a thin line fade in at the top once scrolled and at the bottom while more rows are hidden, used by a person's Recent activity and by an issue's comments and activity on the full page (scroll the second one)."
      >
        <ScrollPanelDemo />
      </Section>

      <Section
        title="Label pills and multi-select"
        note="A label's name on its own colour (the colour is the label's own data, so it stays a raw colour). On an issue card the pills are buttons that pick the label as a filter (several at once: an issue must have all of them); the chosen ones are ringed. The dropdown has a multiple mode for the same job: the list stays open, each chosen row shows a check, the box summarises the choice, and Clear selection empties it. The pills and the dropdown below share one state."
      >
        <LabelPillsDemo />
      </Section>

      <Section
        title="Dialog"
        note="The modal every popup form uses (the issue editor, opened from the issue list, the issue page and the side panel). A native dialog opened with showModal(): it sits above everything, so with the side panel open it simply appears on top; the page behind is inert, Esc closes only the dialog, focus goes to the first data-autofocus field and back to the opener on close. Fades and grows in. A click on the dimmed area closes it unless dismissOnBackdrop is false (the editor sets that while there is unsaved text)."
      >
        <DialogDemo />
      </Section>

      <Section
        title="Dropdown"
        note="The app's dropdown (owner's pick D4, 2026-10-05), used instead of the browser's select in every filter, form and list. A box that looks like the other controls; a floating list with an optional mark before each label (status dot, priority icon, avatar); a search box once there are more than seven options; the chosen row in the link colour. Keyboard: Down/Up open and move, Home/End jump, Enter or Space choose, a letter jumps to a match, Esc closes only the list, Tab moves on. The box is as wide as its widest option, so a choice never moves its neighbours. Roles and aria attributes follow the select-only combobox pattern."
      >
        <DropdownDemo />
      </Section>

      <Section
        title="Issue card"
        note="The card on the board and the sprints page, and in the drag preview (ADR 0037). A colored edge at the left shows the priority (urgent red, high amber, medium grey, low light grey; none has no edge); the key and due date are on the first line, the title below, then a footer with quiet outlined label tags and the priority in words, so color is never the only signal. In the app the assignee's picture sits top right and a grip shows on hover, focus and touch."
      >
        <IssueCardDemo />
      </Section>

      <Section
        title="View tabs"
        note="Underline tabs that switch between two views of the same thing (owner's pick B, 2026-10-06). On a project, Issues and Board are the List and Board tabs in the page header (ADR 0034). Each tab is a link to its own address, so it is a nav with aria-current, not ARIA tabs. The underline sits on the header's bottom line. Shown below in both states (the links here only reload this page)."
      >
        <ViewTabsDemo />
      </Section>

      <Section
        title="Comment editor"
        note="Formatted comments (ADR 0056): the text is formatted while you type, with a toolbar and keyboard shortcuts (Ctrl+B bold, Ctrl+I italic, Ctrl+Shift+X strikethrough, Ctrl+E code, Ctrl+Shift+K link, Ctrl+Shift+8 and 7 lists; Cmd on a Mac). It stores a small Markdown subset, which the comment card draws. Loaded on demand. This is the real component."
      >
        <CommentEditorDemo />
      </Section>

      <Section
        title="Motion"
        note="How the app moves (owner's design pass, 2026-10-04). Durations 120 to 220ms with one easing (--motion-duration-fast / -base / -slow, --motion-ease-out in app/index.css). Only opacity and transform change, except a row expanding or collapsing, which animates a grid row. Nothing ever delays an action: closing, saving and navigating happen at once and the animation is cosmetic. Everything is off when the system asks for reduced motion."
      >
        <ul className="max-w-3xl list-disc pl-5 text-sm">
          <li>Page change: the new page fades in and rises 6px (motion-rise-in), keyed by path only.</li>
          <li>Loading: rows rise in one after another, 40ms apart for the first 8 (staggerStyle).</li>
          <li>Issue side panel: slides in from the right and fades, and slides out on close. The page behind is not dimmed or changed.</li>
          <li>Dialogs: fade and grow from 96%, the backdrop fades; dropdowns fade and drop 4px.</li>
          <li>Rows: a new row expands open with an accent flash, a removed row collapses.</li>
          <li>Buttons: sink slightly while pressed; a running request shows a spinner, a saved one a tick.</li>
          <li>Confirm opening in place: fade and rise; the issue editor is a dialog (fades and grows). Light/dark: colours cross-fade over about 200ms.</li>
        </ul>
      </Section>

    </Page>
  );
}
