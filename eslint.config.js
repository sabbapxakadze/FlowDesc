// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/bundle/**", "apps/web/build/**", "**/node_modules/**", "**/.turbo/**", "**/coverage/**", "e2e/.tsbuild/**", "playwright-report/**", "test-results/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,

  // apps/web: React + FSD import-direction enforcement.
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      boundaries,
    },
    settings: {
      "boundaries/elements": [
        // "**" (not "*"): FSD slices nest, e.g. entities/issue/model.ts —
        // a single-level glob would silently stop enforcing the boundary
        // rule one directory down.
        { type: "app", pattern: "apps/web/src/app/**" },
        { type: "pages", pattern: "apps/web/src/pages/**" },
        { type: "widgets", pattern: "apps/web/src/widgets/**" },
        { type: "features", pattern: "apps/web/src/features/**" },
        { type: "entities", pattern: "apps/web/src/entities/**" },
        { type: "shared", pattern: "apps/web/src/shared/**" },
      ],
      // The bundled default resolver only tries .mjs/.js/.json/.node —
      // without this, every extensionless TS/TSX import resolves to
      // "unknown" and the boundary rule silently stops checking anything.
      "import/resolver": {
        typescript: { project: "apps/web/tsconfig.json" },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // A layer may only import from layers below it in this list — the
      // architectural rule from CLAUDE.md, enforced as a lint failure
      // instead of relying on discipline. "app" has no restriction; each
      // layer below only sees its own siblings-and-below.
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            {
              from: { element: { type: "app" } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ["app", "pages", "widgets", "features", "entities", "shared"] },
                  },
                },
              },
            },
            {
              from: { element: { type: "pages" } },
              allow: {
                to: {
                  element: {
                    types: { anyOf: ["pages", "widgets", "features", "entities", "shared"] },
                  },
                },
              },
            },
            {
              from: { element: { type: "widgets" } },
              allow: {
                to: { element: { types: { anyOf: ["widgets", "features", "entities", "shared"] } } },
              },
            },
            {
              from: { element: { type: "features" } },
              allow: {
                to: { element: { types: { anyOf: ["features", "entities", "shared"] } } },
              },
            },
            {
              from: { element: { type: "entities" } },
              allow: {
                to: { element: { types: { anyOf: ["entities", "shared"] } } },
              },
            },
            {
              from: { element: { type: "shared" } },
              allow: {
                to: { element: { type: "shared" } },
              },
            },
          ],
        },
      ],
    },
  },

  // apps/web: keep buttons and text links consistent (Button cleanup slice, 2026-10-02).
  // 1. A text link is `buttonVariants({ variant: "link" })` or <Button variant="link">,
  //    not a hand-written `text-link underline` class string.
  // 2. A button is <Button> or <IconButton>. A raw <button> is only for controls that are
  //    not a text or icon button; each such file is listed below with the reason.
  {
    files: ["apps/web/src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/text-\\[var\\(--color-text-link\\)\\] underline/]",
          message:
            'Use <Button variant="link"> or buttonVariants({ variant: "link" }) instead of hand-writing the link style.',
        },
        {
          selector: "TemplateElement[value.raw=/text-\\[var\\(--color-text-link\\)\\] underline/]",
          message:
            'Use <Button variant="link"> or buttonVariants({ variant: "link" }) instead of hand-writing the link style.',
        },
        {
          selector: "JSXOpeningElement[name.name='button']",
          message:
            "Use <Button> or <IconButton>. If this control is neither a text nor an icon button, add the file to the raw-button list in eslint.config.js with the reason.",
        },
      ],
    },
  },
  // The files allowed to hold a raw <button>, and why:
  {
    files: [
      "apps/web/src/shared/ui/Button.tsx", // the Button itself
      "apps/web/src/shared/ui/IconButton.tsx", // the IconButton itself
      "apps/web/src/shared/ui/Dropdown.tsx", // the box that opens the list: a select-style control, not a Button look
      "apps/web/src/shared/ui/PersonHover.tsx", // the name that opens a card: text plus avatar, not a Button look
      "apps/web/src/shared/ui/ActionMenu.tsx", // the rows of a popup menu: full-width list rows, not a Button look
      "apps/web/src/shared/ui/ThemeSwitch.tsx", // a segmented toggle group
      "apps/web/src/entities/issue/ui/DragHandle.tsx", // a drag handle with dnd-kit listeners
      "apps/web/src/pages/project-detail/ui/IssueToolbar.tsx", // the status tabs: a joined pill group of toggle buttons, not a Button look
      "apps/web/src/entities/issue/ui/IssueSectionHeader.tsx", // a whole group header strip is the button (an accordion), not a Button look
      "apps/web/src/entities/label/ui/LabelBadge.tsx", // the small remove X inside a coloured pill
      "apps/web/src/features/post-comment/ui/CommentForm.tsx", // the x that removes a chosen file inside a chip
      "apps/web/src/widgets/command-palette/CommandPalette.tsx", // result rows and the open trigger
      "apps/web/src/widgets/notification-bell/NotificationBell.tsx", // the bell and the notification rows
      "apps/web/src/widgets/sidebar/Sidebar.tsx", // sidebar items and Log out use the sidebar colours
      "apps/web/src/features/app-tour/ui/TourButton.tsx", // a sidebar row, drawn with the sidebar's own row look passed in by the sidebar
      "apps/web/src/entities/label/ui/LabelPills.tsx", // a coloured pill that is also a filter button, not a Button look
      "apps/web/src/entities/label/ui/LabelColorPicker.tsx", // the colour swatches: a coloured circle that picks, not a Button look
      "apps/web/src/pages/my-work/MyWorkPage.tsx", // notification rows: a whole row is the button, like the bell's
      "apps/web/src/pages/design-system/**", // documents raw controls on purpose
    ],
    rules: { "no-restricted-syntax": "off" },
  },
  // The one place that defines the link look is allowed to write it out.
  {
    files: ["apps/web/src/shared/ui/buttonVariants.ts"],
    rules: { "no-restricted-syntax": "off" },
  },

  // apps/api: no React/FSD rules, just TS.
  {
    files: ["apps/api/src/**/*.ts", "packages/**/src/**/*.ts"],
    rules: {},
  },

  // Root-level plain-JS tooling scripts (not part of any workspace
  // package, so no tsconfig covers them) — TS files never hit this
  // problem because typescript-eslint's recommended config disables the
  // base no-undef rule for .ts/.tsx (the compiler already checks that,
  // more accurately). Plain .mjs still needs the runtime globals named.
  {
    files: ["scripts/**/*.mjs", "e2e/scripts/**/*.mjs", "apps/mcp/scripts/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", URL: "readonly", localStorage: "readonly" },
    },
  },
);
