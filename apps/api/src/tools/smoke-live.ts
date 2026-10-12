import { pathToFileURL } from "node:url";

/**
 * A read-only check of a running FlowDesc (ADR 0055): `node apps/api/src/tools/smoke-live.ts https://flowdesk-yotg.onrender.com`.
 * It only sends GET requests, creates nothing and logs in as nobody, so it is safe against the live site. It checks that the site is up,
 * serves the app, keeps its private endpoints private, does not hand out files like `.env`, and sends its security headers. It does NOT
 * touch the database (the health check does not), so a database outage is not detected by it.
 *
 * Self-contained on purpose (no imports from the project, only Node's own): Node 24 runs a `.ts` file with only erasable types directly,
 * so the scheduled GitHub workflow can run it without installing anything.
 */
export interface SmokeResult {
  name: string;
  ok: boolean;
  detail: string;
}

interface Reply {
  status: number;
  type: string;
  headers: Headers;
  text: string;
}

async function get(base: string, path: string): Promise<Reply> {
  const res = await fetch(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(30_000) });
  return { status: res.status, type: res.headers.get("content-type") ?? "", headers: res.headers, text: await res.text() };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Waits for the health check to answer (a free Render service sleeps and takes up to a minute to wake). */
async function waitForHealth(base: string, waitSeconds: number): Promise<Reply | Error> {
  const deadline = Date.now() + waitSeconds * 1000;
  for (;;) {
    let last: Reply | Error;
    try {
      last = await get(base, "/api/health");
      if (last.status === 200) return last;
    } catch (err) {
      last = err instanceof Error ? err : new Error(String(err));
    }
    if (Date.now() >= deadline) return last;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

export async function runSmoke(baseUrl: string, options: { waitSeconds?: number } = {}): Promise<SmokeResult[]> {
  const results: SmokeResult[] = [];
  const check = (name: string, ok: boolean, detail: string) => results.push({ name, ok, detail });

  const health = await waitForHealth(baseUrl, options.waitSeconds ?? 0);
  if (health instanceof Error) {
    check("health answers", false, `no answer: ${health.message}`);
    return results; // nothing else can be checked
  }
  const healthBody = parseJson(health.text) as { status?: string } | undefined;
  check("health answers 200 with status ok", health.status === 200 && healthBody?.status === "ok", `${health.status} ${health.text.slice(0, 60)}`);

  const home = await get(baseUrl, "/");
  check("the app's page is served", home.status === 200 && home.type.includes("text/html") && home.text.includes("FlowDesc"), `${home.status} ${home.type}`);

  const csp = home.headers.get("content-security-policy") ?? "";
  check("a strict Content-Security-Policy is sent", csp.includes("default-src 'self'") && csp.includes("object-src 'none'") && !csp.includes("'unsafe-eval'"), csp ? csp.slice(0, 60) : "missing");
  check("nosniff is sent", home.headers.get("x-content-type-options") === "nosniff", home.headers.get("x-content-type-options") ?? "missing");
  check("the framework is not announced (no X-Powered-By)", home.headers.get("x-powered-by") === null, home.headers.get("x-powered-by") ?? "absent");
  if (baseUrl.startsWith("https://")) {
    check("HSTS is sent", (home.headers.get("strict-transport-security") ?? "").includes("max-age="), home.headers.get("strict-transport-security") ?? "missing");
  }

  const account = await get(baseUrl, "/api/v1/users/me/account");
  const accountBody = parseJson(account.text) as { error?: { code?: string } } | undefined;
  check("a private endpoint refuses a visitor (401)", account.status === 401 && accountBody?.error?.code === "unauthenticated", `${account.status}`);

  const unknown = await get(baseUrl, "/api/nothing-here");
  check("an unknown API address is a JSON 404", unknown.status === 404 && unknown.type.includes("application/json"), `${unknown.status} ${unknown.type}`);

  for (const secret of ["/.env", "/.git/config"]) {
    const file = await get(baseUrl, secret);
    const leaked = /DATABASE_URL|JWT_SECRET|\[core\]/.test(file.text);
    check(`${secret} is not served as a file`, !leaked && (file.status === 404 || file.type.includes("text/html")), `${file.status} ${file.type}`);
  }

  const providers = await get(baseUrl, "/api/v1/auth/oauth/providers");
  const providersBody = parseJson(providers.text) as { data?: { providers?: unknown } } | undefined;
  check("the sign-in providers answer", providers.status === 200 && Array.isArray(providersBody?.data?.providers), `${providers.status}`);

  const demo = await get(baseUrl, "/api/v1/demo/info");
  const demoBody = parseJson(demo.text) as { data?: { enabled?: unknown } } | undefined;
  check("the demo info answers", demo.status === 200 && typeof demoBody?.data?.enabled === "boolean", `${demo.status}`);

  return results;
}

async function main() {
  const base = process.argv[2];
  if (!base) {
    process.stderr.write("usage: node apps/api/src/tools/smoke-live.ts <https://address> [secondsToWaitForTheServerToWake]\n");
    process.exit(2);
  }
  const results = await runSmoke(base, { waitSeconds: Number(process.argv[3] ?? 180) });
  for (const r of results) process.stdout.write(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  (${r.detail})\n`);
  const failed = results.filter((r) => !r.ok).length;
  process.stdout.write(`\n${results.length - failed} passed, ${failed} failed (${base})\n`);
  process.exit(failed === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
