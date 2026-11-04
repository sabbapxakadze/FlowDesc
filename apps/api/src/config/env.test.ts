import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.js";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  JWT_SECRET: "x".repeat(32),
  ATTACHMENT_SIGNING_SECRET: "y".repeat(32),
  RESEND_API_KEY: "key",
  EMAIL_FROM: "a@example.com",
};

describe("config/env - parseEnv", () => {
  it("takes APP_URL from Render's RENDER_EXTERNAL_URL when APP_URL is not set", () => {
    // Why: on Render the service's address is only known after it exists; reading it from the platform removes a manual step and a typo risk.
    const parsed = parseEnv({ ...base, RENDER_EXTERNAL_URL: "https://flowdesk-abc.onrender.com" });
    expect(parsed.success && parsed.data.APP_URL).toBe("https://flowdesk-abc.onrender.com");
  });

  it("an APP_URL that is set always wins over Render's address (a custom domain later)", () => {
    const parsed = parseEnv({ ...base, APP_URL: "https://app.example.org", RENDER_EXTERNAL_URL: "https://flowdesk-abc.onrender.com" });
    expect(parsed.success && parsed.data.APP_URL).toBe("https://app.example.org");
  });

  it("with neither, the server still refuses to start (a missing address must crash at boot, not at the first email)", () => {
    const parsed = parseEnv({ ...base });
    expect(parsed.success).toBe(false);
    expect(parsed.success ? [] : Object.keys(parsed.error.flatten().fieldErrors)).toContain("APP_URL");
  });

  it("an empty APP_URL counts as not set", () => {
    // Why: a platform form that leaves the field empty sends "", which must not mask the fallback.
    const parsed = parseEnv({ ...base, APP_URL: "", RENDER_EXTERNAL_URL: "https://flowdesk-abc.onrender.com" });
    expect(parsed.success && parsed.data.APP_URL).toBe("https://flowdesk-abc.onrender.com");
  });

  it("Ask FlowDesc's AI is off unless a driver is set; 'cloudflare' needs both its account id and token, and 'fake' is refused in production (ADR 0077)", () => {
    // Why: a half-set provider must crash at boot (not at the first question), and a fake that answers real people with canned text must never run live.
    const withApp = { ...base, APP_URL: "http://localhost:5173" };
    const off = parseEnv(withApp);
    expect(off.success && [off.data.AI_DRIVER, off.data.AI_MODEL]).toEqual([undefined, "@cf/meta/llama-3.1-8b-instruct-fp8-fast"]);

    const account = "0123456789abcdef0123456789abcdef";
    expect(parseEnv({ ...withApp, AI_DRIVER: "cloudflare" }).success).toBe(false);
    expect(parseEnv({ ...withApp, AI_DRIVER: "cloudflare", CLOUDFLARE_ACCOUNT_ID: account }).success).toBe(false);
    expect(parseEnv({ ...withApp, AI_DRIVER: "cloudflare", CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_AI_TOKEN: "t".repeat(40) }).success).toBe(true);

    expect(parseEnv({ ...withApp, AI_DRIVER: "fake" }).success).toBe(true);
    expect(parseEnv({ ...withApp, AI_DRIVER: "fake", NODE_ENV: "production" }).success).toBe(false);
    expect(parseEnv({ ...withApp, AI_DRIVER: "openai" }).success).toBe(false);
  });

  it("refuses an account id or a model name that could change the address the AI is called at", () => {
    // Why: both go into the request address, so a stray path or query in a setting must stop the server at boot.
    const withApp = { ...base, APP_URL: "http://localhost:5173" };
    expect(parseEnv({ ...withApp, CLOUDFLARE_ACCOUNT_ID: "../x" }).success).toBe(false);
    expect(parseEnv({ ...withApp, AI_MODEL: "@cf/meta/../../x" }).success).toBe(false);
    expect(parseEnv({ ...withApp, AI_MODEL: "@cf/mistral/mistral-7b-instruct-v0.1" }).success).toBe(true);
  });

  it("STORAGE_DRIVER defaults to local and DB_POOL_MAX to 10; an unknown driver is refused", () => {
    const ok = parseEnv({ ...base, APP_URL: "http://localhost:5173" });
    expect(ok.success && [ok.data.STORAGE_DRIVER, ok.data.DB_POOL_MAX]).toEqual(["local", 10]);
    expect(parseEnv({ ...base, APP_URL: "http://localhost:5173", STORAGE_DRIVER: "s4" }).success).toBe(false);
  });

  it("the s3 storage driver needs all five S3 settings; local and disabled need none", () => {
    // Why: a deploy that says STORAGE_DRIVER=s3 but forgets one value must crash at boot with a clear message, not on the first upload.
    const s3 = { S3_ENDPOINT: "https://br-x.storage.c-5.eu-central-1.aws.neon.tech", S3_REGION: "eu-central-1", S3_BUCKET: "flowdesk-files", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s" };
    const common = { ...base, APP_URL: "https://x.example.org" };
    expect(parseEnv({ ...common, STORAGE_DRIVER: "s3", ...s3 }).success).toBe(true);
    for (const name of Object.keys(s3)) {
      const without = { ...s3 } as Record<string, string>;
      delete without[name];
      const parsed = parseEnv({ ...common, STORAGE_DRIVER: "s3", ...without });
      expect(parsed.success, name).toBe(false);
      expect(parsed.success ? [] : Object.keys(parsed.error.flatten().fieldErrors), name).toContain(name);
    }
    expect(parseEnv({ ...common, STORAGE_DRIVER: "local" }).success).toBe(true);
    expect(parseEnv({ ...common, STORAGE_DRIVER: "disabled" }).success).toBe(true);
  });
});
