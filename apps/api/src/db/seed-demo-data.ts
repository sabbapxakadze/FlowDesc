/**
 * The CONTENT of the demo organization (ADR 0039): who is in it, the labels, and every project's issues, sprints and comments.
 * Plain data, no database calls; `seed-demo.ts` turns it into rows. Times are written as "days ago" (or "days from today" for
 * due dates), so the demo always looks current whenever it is (re)built.
 *
 * Comment text can mention a person with `{alex}`, `{nino}`... which becomes the real `@[Name](user:<id>)` token (ADR 0033).
 */

export type PersonKey = "alex" | "nino" | "marcus" | "sofia" | "daniel";
export type Role = "owner" | "admin" | "member" | "viewer";
export type Status = "todo" | "in_progress" | "done";
export type Priority = "none" | "low" | "medium" | "high" | "urgent";
export type LabelName =
  | "bug"
  | "feature"
  | "design"
  | "docs"
  | "tech-debt"
  | "security"
  | "performance"
  | "customer-request";

export const DEMO_PASSWORD = "Demo123!@#";
export const DEMO_ORG_SLUG = "flowdesc-demo";
export const DEMO_ORG_NAME = "FlowDesc Demo";

export interface PersonSpec {
  email: string;
  name: string;
  role: Role;
  jobTitle: string;
  bio: string;
}

export const PEOPLE: Record<PersonKey, PersonSpec> = {
  alex: {
    email: "demo@flowdesc.test",
    name: "Alex Morgan",
    role: "owner",
    jobTitle: "Engineering Manager",
    bio: "I run the product team. Ask me about priorities, sprints, or where the coffee is.",
  },
  nino: {
    email: "nino.beridze@flowdesc.test",
    name: "Nino Beridze",
    role: "admin",
    jobTitle: "Tech Lead",
    bio: "Backend and infrastructure. I review most pull requests before lunch.",
  },
  marcus: {
    email: "marcus.lee@flowdesc.test",
    name: "Marcus Lee",
    role: "member",
    jobTitle: "Frontend Engineer",
    bio: "Web and mobile front ends. Performance numbers make me happy.",
  },
  sofia: {
    email: "sofia.rossi@flowdesc.test",
    name: "Sofia Rossi",
    role: "member",
    jobTitle: "Product Designer",
    bio: "Design systems, prototypes and the occasional illustration.",
  },
  daniel: {
    email: "daniel.okafor@flowdesc.test",
    name: "Daniel Okafor",
    role: "viewer",
    jobTitle: "QA Analyst",
    bio: "I read everything and break what I can. Viewer access: I comment, I do not edit.",
  },
};

export const LABELS: Record<LabelName, string> = {
  bug: "#dc2626",
  feature: "#2563eb",
  design: "#be185d",
  docs: "#059669",
  "tech-debt": "#d97706",
  security: "#7c3aed",
  performance: "#0891b2",
  "customer-request": "#475569",
};

export interface CommentSpec {
  by: PersonKey;
  /** Days ago; must be more recent than the issue's `createdAgo`. */
  agoDays: number;
  text: string;
  /** The text after a later edit (the comment then shows "(edited)"). */
  edited?: string;
  /** Posted, then deleted: the timeline keeps a "comment deleted" line. */
  deleted?: boolean;
}

export interface IssueSpec {
  title: string;
  description?: string;
  status: Status;
  priority?: Priority;
  labels?: LabelName[];
  assignee?: PersonKey;
  reporter?: PersonKey;
  /** Days from today; negative is overdue. */
  dueIn?: number;
  createdAgo: number;
  /** For a done issue: when it was finished (days ago). */
  doneAgo?: number;
  /** Which still-open sprint it belongs to, if any; everything else sits in the backlog. */
  sprint?: "active" | "planned";
  comments?: CommentSpec[];
}

export interface SprintSpec {
  name: string;
  status: "completed" | "active" | "planned";
  /** Days ago the sprint started / ended (a planned sprint has no dates; an active one ends in the future: negative). */
  startAgo?: number;
  endAgo?: number;
}

export interface HistorySpec {
  title: string;
  labels?: LabelName[];
  assignee?: PersonKey;
  priority?: Priority;
}

export interface ProjectSpec {
  key: string;
  name: string;
  sprints: SprintSpec[];
  current: IssueSpec[];
  /** Finished work from the completed sprints: what the Throughput, Cycle time and Velocity charts are built from. */
  history: HistorySpec[];
}

export const PROJECTS: ProjectSpec[] = [
  {
    key: "WEB",
    name: "Website Redesign",
    sprints: [
      { name: "Sprint 1", status: "completed", startAgo: 64, endAgo: 51 },
      { name: "Sprint 2", status: "completed", startAgo: 50, endAgo: 37 },
      { name: "Sprint 3", status: "completed", startAgo: 36, endAgo: 23 },
      { name: "Sprint 4", status: "completed", startAgo: 22, endAgo: 9 },
      { name: "Sprint 5", status: "active", startAgo: 8, endAgo: -6 },
      { name: "Sprint 6", status: "planned" },
    ],
    history: [
      {
        title: "Set up the CMS staging environment",
        labels: ["tech-debt"],
        assignee: "nino",
        priority: "high",
      },
      {
        title: "Choose the new typography scale",
        labels: ["design"],
        assignee: "sofia",
        priority: "medium",
      },
      {
        title: "Audit the existing page templates",
        labels: ["docs"],
        assignee: "marcus",
        priority: "medium",
      },
      {
        title: "Implement the responsive grid",
        labels: ["feature"],
        assignee: "marcus",
        priority: "high",
      },
      {
        title: "Create the new main navigation",
        labels: ["feature", "design"],
        assignee: "sofia",
        priority: "high",
      },
      {
        title: "Migrate blog posts to the new CMS",
        labels: ["tech-debt"],
        assignee: "nino",
        priority: "medium",
      },
      {
        title: "Add sitemap and robots.txt",
        labels: ["docs"],
        assignee: "nino",
        priority: "low",
      },
      {
        title: "Fix broken links on the careers page",
        labels: ["bug"],
        assignee: "marcus",
        priority: "low",
      },
      {
        title: "Design the new homepage hero",
        labels: ["design"],
        assignee: "sofia",
        priority: "high",
      },
      {
        title: "Add analytics events for call-to-action clicks",
        labels: ["feature"],
        assignee: "marcus",
        priority: "medium",
      },
      {
        title: "Audit and prune unused CSS",
        labels: ["tech-debt", "performance"],
        assignee: "marcus",
        priority: "low",
      },
      {
        title: "Add Open Graph images for shared links",
        labels: ["feature"],
        assignee: "sofia",
        priority: "medium",
      },
      {
        title: "Fix the contact form on Safari",
        labels: ["bug"],
        assignee: "marcus",
        priority: "high",
      },
      {
        title: "Write the content style guide",
        labels: ["docs"],
        assignee: "alex",
        priority: "low",
      },
      {
        title: "Set up uptime monitoring",
        labels: ["tech-debt"],
        assignee: "nino",
        priority: "medium",
      },
      {
        title: "Create the 404 and error pages",
        labels: ["design", "feature"],
        assignee: "sofia",
        priority: "medium",
      },
    ],
    current: [
      {
        title: "Redesign the pricing page",
        description:
          "The pricing page is the most visited page after the homepage and its conversion is low.\n\nGoals:\n- Show the three plans side by side\n- Make the annual discount obvious\n- Add a short FAQ under the table\n\nDesign is in Figma, link in the thread.",
        status: "in_progress",
        priority: "high",
        labels: ["design", "feature"],
        assignee: "sofia",
        reporter: "alex",
        dueIn: 5,
        createdAgo: 12,
        sprint: "active",
        comments: [
          {
            by: "nino",
            agoDays: 6,
            text: "Can we show annual pricing by default? {sofia} what do you think?",
          },
          {
            by: "sofia",
            agoDays: 5.5,
            text: "Yes, I will add a toggle and default it to annual. Mockups ready by Thursday.",
          },
          {
            by: "alex",
            agoDays: 1.2,
            text: "Looks great. {marcus} can you pick this up for the build once Sofia hands it over?",
            edited:
              "Looks great. {marcus} can you pick this up for the build once Sofia hands it over? No rush before Friday.",
          },
        ],
      },
      {
        title: "Fix layout shift on the homepage hero image",
        description:
          "The hero image loads late and pushes the headline down. Lighthouse reports a cumulative layout shift of 0.31 on mobile.\n\nReserve the space with width and height attributes and use a blurred placeholder.",
        status: "todo",
        priority: "urgent",
        labels: ["bug", "performance"],
        assignee: "marcus",
        reporter: "daniel",
        dueIn: -2,
        createdAgo: 9,
        sprint: "active",
        comments: [
          {
            by: "daniel",
            agoDays: 8.5,
            text: "Reproduced on an iPhone 12 and a Pixel 7. The headline jumps down about 120px.",
          },
          {
            by: "marcus",
            agoDays: 3,
            text: "I know the cause, the image has no intrinsic size. Fix is small, I will start tomorrow.",
          },
          {
            by: "alex",
            agoDays: 0.4,
            text: "{marcus} this is overdue and it hurts our score. Can you take it first thing tomorrow?",
          },
        ],
      },
      {
        title: "Add a cookie consent banner",
        description:
          "We need a consent banner before we add the new analytics. It must remember the choice and let people change it from the footer.",
        status: "todo",
        priority: "medium",
        labels: ["feature", "security"],
        assignee: "nino",
        reporter: "alex",
        dueIn: 10,
        createdAgo: 7,
      },
      {
        title: "Write the migration guide for the new CMS",
        description:
          "A short guide for the content team: how to log in, create a page, schedule a post, and roll back a change.\n\nScreenshots please, they never read long paragraphs.",
        status: "in_progress",
        priority: "medium",
        labels: ["docs"],
        assignee: "alex",
        reporter: "nino",
        dueIn: 3,
        createdAgo: 10,
        sprint: "active",
        comments: [
          {
            by: "nino",
            agoDays: 4,
            text: "I put the CMS admin credentials format in the thread. {alex} you can use it for the screenshots.",
          },
        ],
      },
      {
        title: "Improve the Lighthouse performance score above 90",
        description:
          "Current mobile score is 74. Biggest wins: image sizes, unused JavaScript, and render-blocking fonts.",
        status: "in_progress",
        priority: "high",
        labels: ["performance", "tech-debt"],
        assignee: "marcus",
        reporter: "nino",
        dueIn: 7,
        createdAgo: 14,
        sprint: "active",
      },
      {
        title: "Footer links open the wrong page on mobile",
        description:
          "On small screens the Careers link opens the Press page. The two routes were swapped in the mobile footer component.",
        status: "done",
        priority: "medium",
        labels: ["bug"],
        assignee: "marcus",
        reporter: "daniel",
        createdAgo: 6,
        doneAgo: 2,
        sprint: "active",
        comments: [
          {
            by: "daniel",
            agoDays: 1.8,
            text: "Verified on three devices. Closing from my side.",
          },
        ],
      },
      {
        title: "Update brand colors across components",
        description:
          "Replace the old blue with the new teal in buttons, links and charts. Use the design tokens, no raw hex values.",
        status: "done",
        priority: "high",
        labels: ["design"],
        assignee: "sofia",
        reporter: "alex",
        createdAgo: 11,
        doneAgo: 4,
        sprint: "active",
      },
      {
        title: "Customer testimonial carousel",
        description:
          "Three customers agreed to be quoted. Needs a carousel with arrows and swipe on mobile.",
        status: "todo",
        priority: "low",
        labels: ["feature", "customer-request"],
        assignee: "sofia",
        reporter: "alex",
        createdAgo: 16,
      },
      {
        title: "Set up redirects from the old blog URLs",
        description:
          "Old links like /blog/2021/05/slug must keep working after the CMS move. Search engines are already dropping them.",
        status: "todo",
        priority: "high",
        labels: ["tech-debt"],
        assignee: "nino",
        reporter: "alex",
        dueIn: -5,
        createdAgo: 20,
        comments: [
          {
            by: "nino",
            agoDays: 15,
            text: "I exported the old URL list, about 340 entries. I will turn it into a redirect map.",
          },
          {
            by: "alex",
            agoDays: 2,
            text: "{nino} this one slipped. Is there anything blocking it?",
          },
          {
            by: "nino",
            agoDays: 1.5,
            text: "Only my time. I will do it in the next sprint planning and put it at the top.",
          },
        ],
      },
      {
        title: "Accessibility audit of the checkout flow",
        description:
          "Run through the whole checkout with a keyboard and a screen reader. Report contrast, focus order and form label problems.",
        status: "todo",
        priority: "high",
        labels: ["bug"],
        assignee: "daniel",
        reporter: "alex",
        dueIn: 14,
        createdAgo: 5,
        sprint: "planned",
      },
      {
        title: "Add dark mode to the marketing site",
        description:
          "Follow the visitor's system setting. Needs dark variants of the illustrations.",
        status: "todo",
        priority: "none",
        labels: ["feature"],
        createdAgo: 18,
      },
      {
        title: "Newsletter signup form accepts invalid emails",
        description:
          "Typing 'hello@' still shows the success message and the address ends up in the list. Validate on the client and the server.",
        status: "in_progress",
        priority: "medium",
        labels: ["bug", "customer-request"],
        assignee: "marcus",
        reporter: "daniel",
        dueIn: 1,
        createdAgo: 4,
        sprint: "active",
        comments: [
          {
            by: "daniel",
            agoDays: 3.5,
            text: "Also accepts spaces in the middle of the address.",
          },
          {
            by: "marcus",
            agoDays: 0.8,
            text: "Client check is done, working on the server side now.",
            deleted: true,
          },
        ],
      },
      {
        title: "Replace stock photos on the About page",
        description:
          "We have real team photos now. Sofia has the crops, they just need to be swapped and compressed.",
        status: "todo",
        priority: "low",
        labels: ["design"],
        assignee: "sofia",
        reporter: "alex",
        createdAgo: 8,
        sprint: "planned",
      },
      {
        title: "Document the component library in Storybook",
        description:
          "Every shared component needs a story with its states. Start with buttons, inputs and cards.",
        status: "todo",
        priority: "medium",
        labels: ["docs", "tech-debt", "design", "feature"],
        assignee: "nino",
        reporter: "marcus",
        createdAgo: 22,
      },
    ],
  },
  {
    key: "APP",
    name: "Mobile App",
    sprints: [
      { name: "Sprint 1", status: "completed", startAgo: 48, endAgo: 35 },
      { name: "Sprint 2", status: "completed", startAgo: 34, endAgo: 21 },
      { name: "Sprint 3", status: "completed", startAgo: 20, endAgo: 9 },
      { name: "Sprint 4", status: "active", startAgo: 8, endAgo: -6 },
    ],
    history: [
      {
        title: "Set up the React Native project",
        labels: ["tech-debt"],
        assignee: "marcus",
        priority: "high",
      },
      {
        title: "Design the app icon and splash screen",
        labels: ["design"],
        assignee: "sofia",
        priority: "medium",
      },
      {
        title: "Build the login screen",
        labels: ["feature"],
        assignee: "marcus",
        priority: "high",
      },
      {
        title: "Connect the app to the production API",
        labels: ["feature"],
        assignee: "nino",
        priority: "high",
      },
      {
        title: "Add the issue list screen",
        labels: ["feature"],
        assignee: "marcus",
        priority: "medium",
      },
      {
        title: "Fix keyboard covering the comment box",
        labels: ["bug"],
        assignee: "marcus",
        priority: "medium",
      },
      {
        title: "Write the TestFlight beta instructions",
        labels: ["docs"],
        assignee: "alex",
        priority: "low",
      },
      {
        title: "Set up automatic builds",
        labels: ["tech-debt"],
        assignee: "nino",
        priority: "medium",
      },
      {
        title: "Add pull to refresh",
        labels: ["feature"],
        assignee: "marcus",
        priority: "low",
      },
      {
        title: "Fix the crash when rotating the screen",
        labels: ["bug"],
        assignee: "marcus",
        priority: "high",
      },
      {
        title: "Design empty states for every list",
        labels: ["design"],
        assignee: "sofia",
        priority: "medium",
      },
      {
        title: "Add Spanish and German translations",
        labels: ["feature", "customer-request"],
        assignee: "sofia",
        priority: "medium",
      },
    ],
    current: [
      {
        title: "Push notifications for @mentions",
        description:
          "When someone mentions you in a comment the phone should buzz. Respect the quiet hours setting once it exists.",
        status: "in_progress",
        priority: "high",
        labels: ["feature"],
        assignee: "marcus",
        reporter: "alex",
        dueIn: 4,
        createdAgo: 10,
        sprint: "active",
        comments: [
          {
            by: "marcus",
            agoDays: 4,
            text: "Using the same event the web bell uses, so the wording stays identical. {nino} do we have a device token endpoint yet?",
          },
          {
            by: "nino",
            agoDays: 3.2,
            text: "Not yet, I will add POST /devices today. It stores the token per user and platform.",
          },
        ],
      },
      {
        title: "App crashes when opening the camera on Android 12",
        description:
          "Attaching a photo to a comment crashes the app on Android 12 devices. Stack trace points at the camera permission request.",
        status: "todo",
        priority: "urgent",
        labels: ["bug"],
        assignee: "nino",
        reporter: "daniel",
        dueIn: -2,
        createdAgo: 6,
        sprint: "active",
        comments: [
          {
            by: "daniel",
            agoDays: 5.5,
            text: "Happens on a Samsung A52 (Android 12) every time. Android 13 is fine.",
          },
          {
            by: "alex",
            agoDays: 0.6,
            text: "{nino} this blocks the 2.3 release. Can you look at it today?",
          },
        ],
      },
      {
        title: "Offline mode for the issue list",
        description:
          "Cache the last loaded list so the app opens instantly without a connection and syncs when it is back.",
        status: "todo",
        priority: "medium",
        labels: ["feature", "performance"],
        assignee: "marcus",
        reporter: "alex",
        createdAgo: 19,
      },
      {
        title: "Biometric login (Face ID and fingerprint)",
        description:
          "Offer biometrics after the first password login. The refresh token stays in the secure keychain.",
        status: "in_progress",
        priority: "high",
        labels: ["feature", "security"],
        assignee: "nino",
        reporter: "alex",
        dueIn: 9,
        createdAgo: 13,
        sprint: "active",
      },
      {
        title: "Update the onboarding screens to the new brand",
        description: "Three screens, new illustrations from Sofia, shorter copy.",
        status: "done",
        priority: "medium",
        labels: ["design"],
        assignee: "sofia",
        reporter: "alex",
        createdAgo: 9,
        doneAgo: 3,
        sprint: "active",
      },
      {
        title: "Reduce the app start time below two seconds",
        description:
          "Cold start is about 3.4 seconds on a mid-range Android phone. Profile first, then lazy-load what we can.",
        status: "todo",
        priority: "high",
        labels: ["performance"],
        assignee: "marcus",
        reporter: "nino",
        dueIn: 12,
        createdAgo: 11,
      },
      {
        title: "Dark mode follows the system setting",
        description:
          "Use the operating system theme by default and keep the manual switch in settings.",
        status: "done",
        priority: "low",
        labels: ["feature"],
        assignee: "marcus",
        reporter: "sofia",
        createdAgo: 12,
        doneAgo: 6,
        sprint: "active",
      },
      {
        title: "Integrate crash reporting",
        description:
          "We learn about crashes from users right now. Pick a service and add it to the release build only.",
        status: "todo",
        priority: "medium",
        labels: ["tech-debt"],
        reporter: "nino",
        createdAgo: 15,
      },
      {
        title: "Tablet layout for the board view",
        description:
          "The board is one column on a tablet. Show all three columns side by side in landscape.",
        status: "todo",
        priority: "low",
        labels: ["design", "feature"],
        assignee: "sofia",
        reporter: "alex",
        createdAgo: 17,
      },
      {
        title: "Submit version 2.3 to the App Store",
        description:
          "Checklist: release notes, screenshots, review notes with the demo login, and a build number bump.",
        status: "todo",
        priority: "urgent",
        labels: ["customer-request"],
        assignee: "alex",
        reporter: "nino",
        dueIn: 2,
        createdAgo: 7,
        sprint: "active",
        comments: [
          {
            by: "nino",
            agoDays: 1,
            text: "{alex} I will hand you the build once the camera crash is fixed. Screenshots are already in the shared folder.",
          },
        ],
      },
      {
        title: "Fix a typo in the Spanish translation of onboarding",
        description: "'Bienvenido' is spelled 'Bienvendo' on the second screen.",
        status: "done",
        priority: "low",
        labels: ["bug"],
        assignee: "sofia",
        reporter: "daniel",
        createdAgo: 4,
        doneAgo: 1,
      },
    ],
  },
  {
    key: "API",
    name: "Platform API",
    sprints: [
      { name: "Sprint 1", status: "completed", startAgo: 48, endAgo: 35 },
      { name: "Sprint 2", status: "completed", startAgo: 34, endAgo: 21 },
      { name: "Sprint 3", status: "completed", startAgo: 20, endAgo: 9 },
    ],
    history: [
      {
        title: "Add refresh token rotation",
        labels: ["security"],
        assignee: "nino",
        priority: "high",
      },
      {
        title: "Index the issues table for the board query",
        labels: ["performance"],
        assignee: "nino",
        priority: "medium",
      },
      {
        title: "Write the OpenAPI description for issues",
        labels: ["docs"],
        assignee: "marcus",
        priority: "low",
      },
      {
        title: "Return field-level validation errors",
        labels: ["feature"],
        assignee: "nino",
        priority: "medium",
      },
      {
        title: "Add the notifications endpoints",
        labels: ["feature"],
        assignee: "marcus",
        priority: "high",
      },
      {
        title: "Fix duplicate events on retry",
        labels: ["bug"],
        assignee: "nino",
        priority: "high",
      },
      {
        title: "Set up structured logging",
        labels: ["tech-debt"],
        assignee: "marcus",
        priority: "medium",
      },
      {
        title: "Add tenant isolation tests",
        labels: ["security"],
        assignee: "nino",
        priority: "high",
      },
      {
        title: "Add the labels endpoints",
        labels: ["feature"],
        assignee: "marcus",
        priority: "medium",
      },
      {
        title: "Return consistent pagination cursors",
        labels: ["tech-debt"],
        assignee: "nino",
        priority: "medium",
      },
      {
        title: "Add database backups and a restore test",
        labels: ["tech-debt", "security"],
        assignee: "nino",
        priority: "high",
      },
      {
        title: "Fix the timezone bug in the due date filter",
        labels: ["bug"],
        assignee: "marcus",
        priority: "medium",
      },
    ],
    current: [
      {
        title: "Rate limit the public endpoints",
        description:
          "Login, register and password reset need per-IP and per-email limits. Return 429 with a Retry-After header.",
        status: "in_progress",
        priority: "high",
        labels: ["security", "feature"],
        assignee: "nino",
        reporter: "alex",
        dueIn: 3,
        createdAgo: 8,
        comments: [
          {
            by: "nino",
            agoDays: 3,
            text: "Limits per IP are in. Per-email is next. I will keep the numbers in config so we can tune them.",
          },
          {
            by: "alex",
            agoDays: 1.4,
            text: "Thanks {nino}. Please make sure the error message tells people how long to wait.",
          },
        ],
      },
      {
        title: "Add pagination to the audit log export",
        description:
          "The CSV export reads every row at once. Stream it in pages so large organizations do not run out of memory.",
        status: "todo",
        priority: "medium",
        labels: ["feature"],
        assignee: "marcus",
        reporter: "nino",
        createdAgo: 10,
      },
      {
        title: "Slow query on the issue search endpoint",
        description:
          "Search takes over 2 seconds for organizations with more than 20,000 issues. The full-text index is not being used for the ranking sort.",
        status: "in_progress",
        priority: "urgent",
        labels: ["performance", "bug"],
        assignee: "nino",
        reporter: "marcus",
        dueIn: -3,
        createdAgo: 11,
        comments: [
          {
            by: "marcus",
            agoDays: 10,
            text: "EXPLAIN shows a sequential scan after the rank sort. Details attached in the query plan I pasted in chat.",
          },
          {
            by: "nino",
            agoDays: 6,
            text: "Reproduced with the seeded 20k dataset. I think the generated column needs a different weight config.",
          },
          {
            by: "alex",
            agoDays: 0.7,
            text: "{nino} customers are noticing. Can we get a fix out this week?",
          },
        ],
      },
      {
        title: "Document webhooks in the API reference",
        description:
          "Event names, payload examples, signature verification and retry behavior.",
        status: "todo",
        priority: "medium",
        labels: ["docs"],
        assignee: "alex",
        reporter: "nino",
        createdAgo: 13,
      },
      {
        title: "Upgrade Node to the latest LTS",
        description:
          "Check the native dependencies (argon2) build on the new version, then update the Docker image and the CI matrix.",
        status: "todo",
        priority: "low",
        labels: ["tech-debt"],
        assignee: "marcus",
        reporter: "nino",
        dueIn: 30,
        createdAgo: 20,
      },
      {
        title: "Return 404 instead of 500 for unknown project keys",
        description:
          "GET /projects/ZZZ throws a raw 500 when the key does not exist. It should be a clean 404 with the standard error body.",
        status: "done",
        priority: "high",
        labels: ["bug"],
        assignee: "nino",
        reporter: "daniel",
        createdAgo: 9,
        doneAgo: 5,
        comments: [
          { by: "daniel", agoDays: 4.5, text: "Confirmed fixed on staging. Thanks!" },
        ],
      },
      {
        title: "Rotate the JWT signing secret",
        description:
          "Plan a rotation without logging everyone out: accept the old secret for one more access token lifetime.",
        status: "todo",
        priority: "high",
        labels: ["security"],
        assignee: "nino",
        reporter: "alex",
        dueIn: 6,
        createdAgo: 6,
      },
      {
        title: "Add request IDs to every log line",
        description:
          "Every request carries an ID in logs and error responses. Include it in the background work it starts.",
        status: "done",
        priority: "medium",
        labels: ["tech-debt"],
        assignee: "marcus",
        reporter: "nino",
        createdAgo: 14,
        doneAgo: 9,
      },
      {
        title: "Customer export: CSV of all issues",
        description:
          "A paying customer asked for a full export of their issues with labels, assignees and dates, for their own reporting.",
        status: "todo",
        priority: "medium",
        labels: ["feature", "customer-request"],
        assignee: "alex",
        reporter: "nino",
        createdAgo: 12,
      },
      {
        title: "Cache the organization member list",
        description:
          "The members endpoint is called on every page load. A short cache with invalidation on membership changes would cut most of the load.",
        status: "in_progress",
        priority: "low",
        labels: ["performance"],
        assignee: "marcus",
        reporter: "nino",
        dueIn: 8,
        createdAgo: 7,
      },
      {
        title: "Clean up unused database indexes",
        description:
          "pg_stat_user_indexes shows four indexes that were never used. Confirm on production-sized data before dropping.",
        status: "todo",
        priority: "none",
        labels: ["tech-debt"],
        reporter: "nino",
        createdAgo: 24,
      },
    ],
  },
];

/** Audit log rows (days ago). `target` is the thing's name; `details` follow what the real code writes. */
export interface AuditSpec {
  by: PersonKey;
  agoDays: number;
  action: string;
  targetType: "project" | "label" | "member" | "sprint";
  target: string;
  details: Record<string, unknown>;
}

export const AUDIT: AuditSpec[] = [
  {
    by: "alex",
    agoDays: 84,
    action: "project.created",
    targetType: "project",
    target: "Website Redesign",
    details: {},
  },
  {
    by: "alex",
    agoDays: 70,
    action: "project.created",
    targetType: "project",
    target: "Mobile App",
    details: {},
  },
  {
    by: "alex",
    agoDays: 60,
    action: "project.created",
    targetType: "project",
    target: "Platform API",
    details: {},
  },
  {
    by: "alex",
    agoDays: 58,
    action: "member.joined",
    targetType: "member",
    target: "Nino Beridze",
    details: { role: "member" },
  },
  {
    by: "alex",
    agoDays: 57,
    action: "member.role_changed",
    targetType: "member",
    target: "Nino Beridze",
    details: { email: "nino.beridze@flowdesc.test", from: "member", to: "admin" },
  },
  {
    by: "marcus",
    agoDays: 50,
    action: "member.joined",
    targetType: "member",
    target: "Marcus Lee",
    details: { role: "member" },
  },
  {
    by: "sofia",
    agoDays: 45,
    action: "member.joined",
    targetType: "member",
    target: "Sofia Rossi",
    details: { role: "member" },
  },
  {
    by: "daniel",
    agoDays: 40,
    action: "member.joined",
    targetType: "member",
    target: "Daniel Okafor",
    details: { role: "viewer" },
  },
  {
    by: "alex",
    agoDays: 38,
    action: "project.renamed",
    targetType: "project",
    target: "Website Redesign",
    details: { from: "Marketing Site", to: "Website Redesign" },
  },
  {
    by: "nino",
    agoDays: 64,
    action: "sprint.started",
    targetType: "sprint",
    target: "Sprint 1",
    details: { projectName: "Website Redesign" },
  },
  {
    by: "nino",
    agoDays: 51,
    action: "sprint.completed",
    targetType: "sprint",
    target: "Sprint 1",
    details: { projectName: "Website Redesign", releasedIssues: 1 },
  },
  {
    by: "nino",
    agoDays: 22,
    action: "sprint.started",
    targetType: "sprint",
    target: "Sprint 4",
    details: { projectName: "Website Redesign" },
  },
  {
    by: "nino",
    agoDays: 9,
    action: "sprint.completed",
    targetType: "sprint",
    target: "Sprint 4",
    details: { projectName: "Website Redesign", releasedIssues: 2 },
  },
  {
    by: "alex",
    agoDays: 20,
    action: "label.updated",
    targetType: "label",
    target: "tech-debt",
    details: { color: { from: "#ca8a04", to: "#d97706" } },
  },
  {
    by: "nino",
    agoDays: 8,
    action: "sprint.started",
    targetType: "sprint",
    target: "Sprint 5",
    details: { projectName: "Website Redesign" },
  },
  {
    by: "alex",
    agoDays: 3,
    action: "member.invited",
    targetType: "member",
    target: "new.designer@example.test",
    details: { role: "member" },
  },
  {
    by: "alex",
    agoDays: 2,
    action: "member.invited",
    targetType: "member",
    target: "contractor@example.test",
    details: { role: "viewer" },
  },
];

export const PENDING_INVITATIONS: { email: string; role: Role; agoDays: number }[] = [
  { email: "new.designer@example.test", role: "member", agoDays: 3 },
  { email: "contractor@example.test", role: "viewer", agoDays: 2 },
];
