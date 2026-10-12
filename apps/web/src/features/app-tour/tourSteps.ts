import type { TourStep } from "../../shared/tour";
import { projectPath } from "../../shared/lib/paths";

/**
 * What the Tutorial says (ADR 0040), in the order it says it. Each step points at a part of the page by its `data-tour` name; those names are
 * the contract with the components that carry them (search the code for `data-tour`). Steps about a project (creating an issue, the board)
 * go to the person's first project; with no project they are left out, and any step whose part is not on screen is skipped while the tour runs.
 */
export function buildTourSteps(projectKey: string | undefined): TourStep[] {
  const start: TourStep[] = [
    {
      id: "welcome",
      title: "Welcome to FlowDesc",
      body: "A two-minute tour of where things are. Use the buttons or the arrow keys, and press Esc whenever you want to stop. The tour never changes any of your data.",
    },
    {
      id: "projects",
      target: "sidebar-projects",
      placement: "right",
      title: "Your projects",
      body: "Every project of your team is here. Open one to see its Issues, Sprints, Analytics and Settings.",
    },
    {
      id: "search",
      target: "search",
      placement: "right",
      title: "Search everything",
      body: "Press Ctrl K (Cmd K on a Mac) from anywhere to find an issue by words from its title or description.",
    },
    {
      id: "my-work",
      target: "my-work",
      placement: "right",
      title: "My work",
      body: "Your home: what is assigned to you across all projects, week by week, with what is overdue and your unread notifications. The next two steps look at it.",
    },
    {
      id: "my-week",
      target: "my-week",
      path: "/",
      placement: "bottom",
      title: "Your week",
      body: "One row per day, with Previous, Next and Today to move through the weeks. Anything overdue also shows on the day it was due, with a red chip. Click an issue to open it beside the page.",
    },
    {
      id: "my-needs-you",
      target: "my-needs-you",
      path: "/",
      placement: "left",
      title: "What needs you",
      body: "Everything overdue, earliest first, then your unread notifications and what changed lately. This side scrolls on its own, so the page itself never has to.",
    },
  ];

  const project: TourStep[] = projectKey
    ? [
        {
          id: "new-issue",
          target: "new-issue",
          path: projectPath(projectKey),
          placement: "bottom",
          title: "Create an issue",
          body: "Click New issue, or just press C. Give it a title and, if you like, a description; it starts in Todo.",
        },
        {
          id: "filters",
          target: "issue-filters",
          path: projectPath(projectKey),
          placement: "bottom",
          title: "Find what matters",
          body: "Filter by status, priority, due date, person or label, and sort. The address remembers your filters, so you can share the link.",
        },
        {
          id: "view-tabs",
          target: "view-tabs",
          path: projectPath(projectKey),
          placement: "bottom",
          title: "List or Board",
          body: "The same issues in two views. The list is for scanning and filtering; the board is for moving work along.",
        },
        {
          id: "board",
          target: "board-columns",
          path: projectPath(projectKey, "board"),
          placement: "bottom",
          title: "Move work along",
          body: "Drag a card to another column to change its status, or up and down to reorder it. Each card also has a grip that works from the keyboard.",
        },
        {
          id: "issue",
          target: "issue-card",
          path: projectPath(projectKey, "board"),
          placement: "right",
          title: "Open an issue",
          body: "Click a card to open it beside the board: description, comments, files and activity. Type @ in a comment to mention a teammate.",
        },
        {
          id: "sprints",
          target: "sprints-link",
          path: projectPath(projectKey, "board"),
          placement: "right",
          title: "Plan with sprints",
          body: "A sprint is a short, fixed stretch of work, usually a week or two: you pick the issues the team will focus on, then close it when the time is up. The next steps walk through the Sprints page.",
        },
        {
          id: "sprint-strip",
          target: "sprint-strip",
          path: projectPath(projectKey, "sprints"),
          placement: "bottom",
          title: "Your sprints, oldest to newest",
          body: "Each card is one sprint. Planned means it is created but not started, Active means it is the one running now, Completed means it is closed. A project has only one active sprint at a time, so Start is unavailable while another is running.",
        },
        {
          id: "new-sprint",
          target: "new-sprint",
          path: projectPath(projectKey, "sprints"),
          placement: "left",
          title: "Create a sprint",
          body: "Give it a name. Start and end dates are optional and only for your reference: a sprint never starts or ends by itself, you start it and you complete it.",
        },
        {
          id: "sprint-backlog",
          target: "sprint-backlog",
          path: projectPath(projectKey, "sprints"),
          placement: "right",
          title: "The backlog",
          body: "Every issue that is not in a sprint. Drag cards to put them in order, and drag one into the active sprint to plan it. Finished issues are tucked away; turn on Show done to see them.",
        },
        {
          id: "sprint-lane",
          target: "sprint-lane",
          path: projectPath(projectKey, "sprints"),
          placement: "left",
          title: "The active sprint",
          body: "Only the active sprint takes issues, so start a planned sprint first. Drag issues in and out, or reorder them. An issue keeps its status when it moves; the bar shows how many are done, in progress and to do.",
        },
        {
          id: "sprint-complete",
          target: "sprint-lane",
          path: projectPath(projectKey, "sprints"),
          placement: "left",
          title: "Completing a sprint",
          body: "Complete sprint closes it. Every issue leaves the sprint and goes to the top of the backlog in the same order: finished ones stay done, the others keep their status, ready for the next sprint. The sprint stays in the row with how many issues it took on and finished.",
        },
        {
          id: "analytics",
          target: "analytics-link",
          path: projectPath(projectKey, "board"),
          placement: "right",
          title: "See how you are doing",
          body: "Throughput, cycle time and sprint velocity (what each sprint took on compared with what it finished), drawn from the history of your issues.",
        },
      ]
    : [];

  const finish: TourStep[] = [
    {
      id: "bell",
      target: "bell",
      placement: "right",
      title: "Notifications",
      body: "Comments, assignments and @mentions reach you here as they happen, and in My work.",
    },
    {
      id: "theme",
      target: "theme-switch",
      placement: "right",
      title: "Make it yours",
      body: "Choose light, dark or follow your system. Your timezone and password are on your account page, under your name.",
    },
    {
      id: "again",
      target: "tour-button",
      placement: "right",
      title: "That is the tour",
      body: "You can replay it any time from this button. Enjoy FlowDesc.",
    },
  ];

  return [...start, ...project, ...finish];
}
