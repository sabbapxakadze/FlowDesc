import { describe, expect, it } from "vitest";
import { AiProviderError, createCloudflareProvider, createFakeProvider, type AiFailure } from "./ai.js";

/**
 * The AI provider seam (ADR 0077). No test here calls Cloudflare: the network is a function the test supplies, so every case is free, instant and
 * repeatable. Each test says what it protects.
 */

const ACCOUNT = "0123456789abcdef0123456789abcdef";
const TOKEN = "cf-token-SECRET-1234567890";
const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
const MESSAGES = [
  { role: "system" as const, content: "Answer only from the sources." },
  { role: "user" as const, content: "What is overdue?" },
];

type Call = { url: string; init: RequestInit };
function provider(answer: (call: Call) => Response | Promise<Response>, extra: { timeoutMs?: number } = {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return answer(call);
  }) as typeof fetch;
  return { calls, ai: createCloudflareProvider({ accountId: ACCOUNT, token: TOKEN, model: MODEL, fetchImpl, ...extra }) };
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ok = (text: string) => json(200, { result: { response: text }, success: true, errors: [], messages: [] });

async function failure(promise: Promise<unknown>): Promise<AiProviderError> {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  expect(error).toBeInstanceOf(AiProviderError);
  return error as AiProviderError;
}

describe("the Cloudflare provider: what it sends", () => {
  it("posts the messages and the answer limit to this account's model address, with the token as a bearer header", async () => {
    // Why: a wrong address, a lost token or a changed body shape would make every question fail, and the unit under test is the only place that builds them.
    const { ai, calls } = provider(() => ok("  Two issues are overdue.  "));
    const result = await ai.generate({ messages: MESSAGES, maxTokens: 400 });

    expect(result.text).toBe("Two issues are overdue."); // trimmed
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${MODEL}`);
    expect(calls[0]!.init.method).toBe("POST");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ messages: MESSAGES, max_tokens: 400 });
  });

  it("reports what the call cost when the provider says so, and ignores figures that are missing or not real numbers", async () => {
    // Why: Workers AI sends the exact Neurons spent on every answer (found by the first real call), so the daily budget can be counted, not guessed.
    // Odd values are dropped instead of trusted, and the prompt the service echoes back is never returned.
    const withUsage = (usage: unknown) =>
      json(200, { success: true, result: { response: "OK", usage, prompt_text: "SECRET ISSUE TEXT", prompt_token_ids: [1, 2, 3] } });

    const real = await provider(() => withUsage({ prompt_tokens: 38, completion_tokens: 3, neurons: 0.26 })).ai.generate({ messages: MESSAGES, maxTokens: 5 });
    expect(real).toEqual({ text: "OK", usage: { promptTokens: 38, completionTokens: 3, neurons: 0.26 } });
    expect(JSON.stringify(real)).not.toContain("SECRET ISSUE TEXT");

    for (const odd of [undefined, {}, { prompt_tokens: 1, completion_tokens: 1 }, { prompt_tokens: "1", completion_tokens: 1, neurons: 1 }, { prompt_tokens: 1, completion_tokens: 1, neurons: -5 }, { prompt_tokens: 1, completion_tokens: 1, neurons: null }]) {
      const answer = await provider(() => withUsage(odd)).ai.generate({ messages: MESSAGES, maxTokens: 5 });
      expect(answer.text).toBe("OK");
      expect(answer.usage).toBeUndefined();
    }
  });

  it("refuses a model name or account id that could change the address it calls", () => {
    // Why: the model goes straight into the URL. Settings are the owner's, but a stray "../" or "?" must be a boot-time mistake, not a request to somewhere else.
    for (const model of ["@cf/meta/../../x", "@cf/meta/llama?x=1", "meta/llama", "@cf/meta", "@cf/meta/llama 3", "https://evil.example/x"]) {
      expect(() => createCloudflareProvider({ accountId: ACCOUNT, token: TOKEN, model }), model).toThrow(/model/);
    }
    expect(() => createCloudflareProvider({ accountId: "../../zone", token: TOKEN, model: MODEL })).toThrow(/account/);
  });
});

describe("the Cloudflare provider: what it says when something goes wrong", () => {
  const cases: { name: string; response: () => Response; kind: AiFailure; status?: number }[] = [
    { name: "429 (limited)", response: () => json(429, { success: false, errors: [{ code: 1, message: "limit" }] }), kind: "rate_limited", status: 429 },
    { name: "401 (bad token)", response: () => json(401, { success: false, errors: [{ message: `bad token ${TOKEN}` }] }), kind: "rejected", status: 401 },
    { name: "403 (no permission)", response: () => json(403, { success: false }), kind: "rejected", status: 403 },
    { name: "500", response: () => json(500, { success: false }), kind: "unavailable", status: 500 },
    { name: "200 but success false", response: () => json(200, { success: false, errors: [{ message: "model not found" }] }), kind: "unavailable", status: 200 },
    { name: "200 with no answer text", response: () => json(200, { success: true, result: {} }), kind: "unavailable", status: 200 },
    { name: "200 with an empty answer", response: () => ok("   "), kind: "unavailable", status: 200 },
    { name: "an HTML error page", response: () => new Response("<html>Bad gateway</html>", { status: 502 }), kind: "unavailable", status: 502 },
  ];

  for (const c of cases) {
    it(`${c.name} becomes "${c.kind}" and the message carries no credential and none of the provider's own text`, async () => {
      // Why: the caller decides what to tell the person from `kind` alone, and an error that carried the token (or whatever the provider echoed
      // back) would end up in a log or a response.
      const { ai } = provider(c.response);
      const error = await failure(ai.generate({ messages: MESSAGES, maxTokens: 100 }));
      expect(error.kind).toBe(c.kind);
      expect(error.status).toBe(c.status);
      for (const text of [error.message, error.name, String(error.stack), JSON.stringify(error)]) {
        expect(text).not.toContain(TOKEN);
        expect(text).not.toContain("model not found"); // the provider's own wording is never repeated
        expect(text).not.toContain("bad token");
      }
    });
  }

  it("a network failure becomes 'unavailable'", async () => {
    const { ai } = provider(() => {
      throw new TypeError("fetch failed: connect ECONNREFUSED");
    });
    const error = await failure(ai.generate({ messages: MESSAGES, maxTokens: 100 }));
    expect(error.kind).toBe("unavailable");
    expect(error.message).not.toContain("ECONNREFUSED");
  });

  it("a service that never answers is cut off at the time limit, as 'timeout'", async () => {
    // Why: ADR 0077 caps a question at 25 seconds so slow requests cannot pile up. The signal must also stop a body that never finishes.
    const { ai } = provider(
      ({ init }) =>
        new Promise<Response>((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener("abort", () => reject((init.signal as AbortSignal).reason));
        }),
      { timeoutMs: 20 },
    );
    const error = await failure(ai.generate({ messages: MESSAGES, maxTokens: 100 }));
    expect(error.kind).toBe("timeout");
    expect(error.message).toContain("did not answer");
  });

  it("a cancelled request (the person left) is 'aborted', not a timeout", async () => {
    // Why: closing the page is not a provider fault, and the endpoint will want to count it differently.
    const controller = new AbortController();
    const { ai } = provider(
      ({ init }) =>
        new Promise<Response>((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener("abort", () => reject((init.signal as AbortSignal).reason));
        }),
    );
    const pending = failure(ai.generate({ messages: MESSAGES, maxTokens: 100, signal: controller.signal }));
    controller.abort();
    expect((await pending).kind).toBe("aborted");
  });
});

describe("the fake provider", () => {
  it("answers from a function and records every call, so a test can read exactly what a real model would have been sent", async () => {
    // Why: every later test of Ask (limits, tenant, injection) runs on this, free and deterministic.
    const fake = createFakeProvider((request) => `You asked: ${request.messages.at(-1)!.content}`);
    expect((await fake.generate({ messages: MESSAGES, maxTokens: 10 })).text).toBe("You asked: What is overdue?");
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.messages).toEqual(MESSAGES);
    expect(fake.name).toBe("fake");
  });
});
