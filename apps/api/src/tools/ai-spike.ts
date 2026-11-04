import { createCloudflareProvider } from "../lib/ai.js";

/**
 * A one-off check against the REAL Cloudflare Workers AI (ADR 0077, slice 1): `pnpm exec tsx --env-file=.env src/tools/ai-spike.ts` from `apps/api`.
 * It settles what the ADR lists as not verified: that chat messages work, what the answer looks like, whether streaming is offered, how large a
 * prompt the model accepts, and what an error looks like. It is NOT part of the tests or of CI: it spends a little of the free daily allowance
 * (about ten calls, a few hundred Neurons of the 10,000) and needs the owner's token, which it reads from the environment and never prints.
 *
 * Reads CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_AI_TOKEN and AI_MODEL (default as in the settings) straight from the environment, so it does not need the
 * server's whole configuration. Everything it prints goes through `show`, which removes the token and shortens long text.
 */
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const token = process.env.CLOUDFLARE_AI_TOKEN ?? "";
const model = process.env.AI_MODEL ?? "@cf/meta/llama-3.1-8b-instruct-fp8-fast";

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}
/** Anything printed: the token removed, and cut to a readable length. */
function show(value: unknown, max = 240): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (token ? text.split(token).join("[token]") : text).replace(/\s+/g, " ").slice(0, max);
}

if (!accountId || !token) {
  out("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN in apps/api/.env first (see .env.example). Nothing was called.");
  process.exit(1);
}

const url = (name: string) => `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${name}`;

/** A raw call, to see exactly what comes back (the provider hides the shape on purpose). */
async function raw(body: unknown, name = model): Promise<{ status: number; type: string; text: string }> {
  const res = await fetch(url(name), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  return { status: res.status, type: res.headers.get("content-type") ?? "", text: await res.text() };
}
function parse(text: string): { success?: boolean; result?: Record<string, unknown>; errors?: { code?: number; message?: string }[] } | undefined {
  try {
    return JSON.parse(text) as ReturnType<typeof parse>;
  } catch {
    return undefined;
  }
}

out(`Model: ${model}\n`);

// 1. The real path: our provider, chat-style messages.
out("1. Chat messages through our provider");
try {
  const started = Date.now();
  const ai = createCloudflareProvider({ accountId, token, model });
  const answer = await ai.generate({
    messages: [
      { role: "system", content: "You answer in one short sentence." },
      { role: "user", content: "Name two things a project board is used for." },
    ],
    maxTokens: 60,
  });
  out(`   OK in ${Date.now() - started} ms: ${show(answer.text)}`);
} catch (err) {
  out(`   FAILED: ${err instanceof Error ? `${err.name} (${(err as { kind?: string }).kind ?? "?"}): ${err.message}` : "unknown"}`);
}

// 2. The raw shape of a successful answer: what else comes back (usage numbers would let us count Neurons exactly).
out("\n2. Shape of a successful answer");
{
  const r = await raw({ messages: [{ role: "user", content: "Say OK." }], max_tokens: 5 });
  const json = parse(r.text);
  out(`   status ${r.status}, ${r.type}`);
  out(`   top-level keys: ${show(Object.keys(json ?? {}))}`);
  out(`   result keys: ${show(Object.keys(json?.result ?? {}))}`);
  out(`   usage: ${show(json?.result?.usage ?? "not in the answer")}`);
}

// 3. Streaming: does `stream: true` give an event stream? Only the first bytes are read.
out("\n3. Streaming");
{
  const res = await fetch(url(model), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "Count from 1 to 5." }], max_tokens: 30, stream: true }),
    signal: AbortSignal.timeout(60_000),
  });
  const reader = res.body?.getReader();
  const first = reader ? await reader.read() : undefined;
  await reader?.cancel().catch(() => undefined);
  out(`   status ${res.status}, ${res.headers.get("content-type") ?? "no content type"}`);
  out(`   first bytes: ${show(first?.value ? new TextDecoder().decode(first.value) : "none", 160)}`);
}

// 4. How big a prompt is accepted. Sizes are rough (about four characters a token); the answer is capped at 5 tokens to keep the cost down.
out("\n4. Prompt size (rough tokens)");
let refused = 0;
for (const tokens of [2_000, 6_000, 12_000, 24_000, 48_000]) {
  const filler = "alpha ".repeat(Math.ceil((tokens * 4) / 6));
  const r = await raw({
    messages: [
      { role: "system", content: "Reply with the single word OK." },
      { role: "user", content: filler },
    ],
    max_tokens: 5,
  });
  const json = parse(r.text);
  if (r.status === 200 && json?.success) {
    out(`   ~${tokens}: accepted (usage: ${show(json.result?.usage ?? "n/a", 120)})`);
  } else {
    out(`   ~${tokens}: status ${r.status}, ${show(json?.errors ?? r.text, 200)}`);
    if (++refused >= 2) break;
  }
}

// 5. What an error looks like (a model that does not exist), so the provider's mapping is based on a real example.
out("\n5. Error shape");
{
  const r = await raw({ messages: [{ role: "user", content: "hi" }] }, "@cf/meta/this-model-does-not-exist");
  out(`   status ${r.status}: ${show(parse(r.text)?.errors ?? r.text, 200)}`);
}

out("\nDone. Paste this output (it contains no token) so the numbers can go into ADR 0077.");
