import { z } from "zod";

/**
 * Every environment variable the API depends on is declared here. If one is
 * missing or malformed, the process must refuse to start — a crash at boot
 * is recoverable by a human reading a clear message; a crash on the first
 * request that happens to touch the missing config is not. See CLAUDE.md's
 * "Config" convention.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters — this signs every access token"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required to send verification/reset emails"),
  EMAIL_FROM: z.email("EMAIL_FROM must be a real email address"),
  // "log" sends nothing: each message is only written to the log (development, and the browser tests that have no real provider key). Anything
  // else (the default) sends through the provider.
  EMAIL_DRIVER: z.enum(["resend", "log"]).default("resend"),
  // Where a "Report a bug" email (ADR 0075) goes. Defaults to EMAIL_FROM, which on the live site is support@flowdesc.app and is forwarded to the owner.
  BUG_REPORT_TO: z.email("BUG_REPORT_TO must be a real email address").optional(),
  // The *frontend's* origin — verification/reset emails link back to the
  // web app (/verify-email, /reset-password), not the API.
  APP_URL: z.url("APP_URL must be a full URL, e.g. http://localhost:5173"),
  // Local disk storage for attachments (Phase 7 slice 4) — real S3 swaps
  // in later (Phase 9) behind the same lib/storage.ts interface. Relative
  // to apps/api's cwd. db/test-setup.ts overrides this to a separate
  // directory for test runs, same pattern it already uses for
  // DATABASE_URL.
  UPLOADS_DIR: z.string().min(1).default("./uploads"),
  // Where uploaded files live (ADR 0049, 0053). "local": the disk under UPLOADS_DIR. "s3": an S3-compatible bucket (Neon Object Storage), set
  // up by the S3_* values below, all required with this driver. "disabled": uploads are refused with a clear message; the first deploy on
  // Render used it because its free disk is wiped on every restart, so a file would silently vanish.
  STORAGE_DRIVER: z.enum(["local", "s3", "disabled"]).default("local"),
  S3_ENDPOINT: z.url("S3_ENDPOINT must be a full URL").optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  // The most connections the pool opens to Postgres (ADR 0049). A free Neon database allows only a limited number of connections at once.
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  // Signs every attachment download token — anyone with this can forge a
  // valid download link. Same min(32) convention as JWT_SECRET.
  ATTACHMENT_SIGNING_SECRET: z
    .string()
    .min(32, "ATTACHMENT_SIGNING_SECRET must be at least 32 characters — this signs every download token"),
  // "Sign in with Google/GitHub" (ADR 0042). A provider is on only when BOTH its id and secret are set (see the
  // refinement below); with none set the buttons simply do not appear.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  // Development only: "true" turns on the fake provider (lib/oauth/fake.ts) so the sign-in buttons and the whole flow
  // can be tried without real Google/GitHub credentials. Refused in production (see the refinement below).
  OAUTH_FAKE: z.enum(["true", "false"]).optional(),
  // "Try the demo" (ADR 0044): a private, self-deleting copy of the demo organization per visitor. OFF unless DEMO_ENABLED is "true", so a
  // deploy that never decided exposes no public write endpoint. A copy lives DEMO_TTL_MINUTES; at most DEMO_MAX_ACTIVE are live at once.
  DEMO_ENABLED: z.enum(["true", "false"]).optional(),
  DEMO_TTL_MINUTES: z.coerce.number().int().min(1).max(24 * 60).default(120),
  DEMO_MAX_ACTIVE: z.coerce.number().int().min(1).max(1000).default(40),
  // Error tracking (ADR 0055). Off unless SENTRY_DSN is set; the SDK is not even loaded then. RENDER_GIT_COMMIT is set by Render and names the
  // deployed version on each report.
  SENTRY_DSN: z.url("SENTRY_DSN must be a full URL").optional(),
  RENDER_GIT_COMMIT: z.string().min(1).optional(),
  // Running in production (ADR 0046). TRUST_PROXY: how many proxies are in front of the server (Render: 1; nothing in front: 0), so the
  // rate limiters see the visitor and not the proxy. SERVE_WEB: serve the built web app from this process (WEB_DIST_DIR overrides where it
  // was built). RUN_MIGRATIONS: bring the database schema up to date when the server starts (Render's free plan has no pre-deploy step).
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  SERVE_WEB: z.enum(["true", "false"]).optional(),
  WEB_DIST_DIR: z.string().min(1).optional(),
  RUN_MIGRATIONS: z.enum(["true", "false"]).optional(),
}).superRefine((value, ctx) => {
  if (value.OAUTH_FAKE === "true" && value.NODE_ENV === "production") {
    ctx.addIssue({ code: "custom", message: "OAUTH_FAKE must not be enabled in production", path: ["OAUTH_FAKE"] });
  }
  if (value.STORAGE_DRIVER === "s3") {
    for (const name of ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
      if (!value[name]) ctx.addIssue({ code: "custom", message: `${name} is required when STORAGE_DRIVER is s3`, path: [name] });
    }
  }
  for (const provider of ["GOOGLE", "GITHUB"] as const) {
    const id = value[`${provider}_CLIENT_ID`];
    const secret = value[`${provider}_CLIENT_SECRET`];
    if (Boolean(id) !== Boolean(secret)) {
      ctx.addIssue({
        code: "custom",
        message: `${provider}_CLIENT_ID and ${provider}_CLIENT_SECRET must be set together`,
        path: [`${provider}_CLIENT_ID`],
      });
    }
  }
});

/**
 * Reads and checks a set of variables. On Render the service's own address is given as RENDER_EXTERNAL_URL, so APP_URL is taken from it when
 * APP_URL itself is not set (an APP_URL that is set always wins, e.g. a custom domain later). Pure (no exit), so it can be tested.
 */
export function parseEnv(source: NodeJS.ProcessEnv) {
  return envSchema.safeParse({ ...source, APP_URL: source.APP_URL || source.RENDER_EXTERNAL_URL || undefined });
}

function loadEnv() {
  const parsed = parseEnv(process.env);

  if (!parsed.success) {
    // Deliberately not using the pino logger here: logging itself depends on
    // LOG_LEVEL, which might be exactly what's malformed. Plain stderr only.
    console.error("Invalid environment configuration:");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
