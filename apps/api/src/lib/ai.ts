/**
 * The AI provider seam (ADR 0077): one small interface that "Ask FlowDesc" talks to, with the Cloudflare Workers AI implementation and a fake
 * for tests behind it. Same idea as `lib/email.ts` and `lib/storage.ts`: swapping the provider (a paid one later, or another free one) is a new
 * file here and a setting, and nothing that asks a question has to change. This file reads no settings of its own, so it can be tested, and used by
 * the one-off check in `tools/ai-spike.ts`, without the server's whole configuration; `ai-provider.ts` builds the real one from the settings.
 *
 * What goes in and out is only text. The model is given no tools or functions (ADR 0077, decision 4), so the worst it can do is write words.
 */

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };
export type AiRequest = {
  messages: AiMessage[];
  /** The most tokens the answer may have. */
  maxTokens: number;
  /** Cancels the call, for example when the person closes the page. */
  signal?: AbortSignal;
};
/**
 * What a call cost, as the provider reported it (Workers AI sends `usage` with a `neurons` figure on every answer, found by the first real call, ADR 0077).
 * Optional: a provider or an answer without it is still an answer.
 */
export type AiUsage = { promptTokens: number; completionTokens: number; neurons: number };
export type AiResponse = { text: string; usage?: AiUsage };

export interface AiProvider {
  readonly name: string;
  generate(request: AiRequest): Promise<AiResponse>;
}

/**
 * Why a call failed, in the few kinds the caller cares about. The text of a failure is always one of our own fixed sentences plus, at most, an HTTP
 * status number: never the provider's own message, a header or the token, so nothing here can carry a credential into a log or an answer.
 */
export type AiFailure = "timeout" | "aborted" | "rate_limited" | "rejected" | "unavailable";

export class AiProviderError extends Error {
  readonly kind: AiFailure;
  readonly status: number | undefined;
  constructor(kind: AiFailure, message: string, status?: number) {
    super(message);
    this.name = "AiProviderError";
    this.kind = kind;
    this.status = status;
  }
}

export type CloudflareConfig = {
  accountId: string;
  token: string;
  /** For example `@cf/meta/llama-3.1-8b-instruct-fp8-fast`. */
  model: string;
  /** Default 25 seconds (ADR 0077). */
  timeoutMs?: number;
  /** For tests. */
  fetchImpl?: typeof fetch;
};

// The model name goes into the address, so it is checked here too (the settings check it as well): only `@cf/` followed by path words, each starting
// with a letter or digit, so `..` can never be a part of it.
const MODEL_PATTERN = /^@cf\/\w[\w.-]*(\/\w[\w.-]*)+$/;
const ACCOUNT_PATTERN = /^[0-9a-f]{32}$/i;

/** The figures, only if all three are real, non-negative numbers (anything odd is dropped rather than trusted). */
function readUsage(value: unknown): AiUsage | undefined {
  const u = value as { prompt_tokens?: unknown; completion_tokens?: unknown; neurons?: unknown } | undefined;
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
  return u && ok(u.prompt_tokens) && ok(u.completion_tokens) && ok(u.neurons)
    ? { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens, neurons: u.neurons }
    : undefined;
}

/** Cloudflare Workers AI over its REST address. Non-streaming: one request, one answer. */
export function createCloudflareProvider(config: CloudflareConfig): AiProvider {
  if (!MODEL_PATTERN.test(config.model)) throw new Error("The AI model name is not a valid Workers AI model.");
  if (!ACCOUNT_PATTERN.test(config.accountId)) throw new Error("The Cloudflare account id must be 32 hexadecimal characters.");
  const timeoutMs = config.timeoutMs ?? 25_000;
  const send = config.fetchImpl ?? fetch;
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${config.model}`;

  return {
    name: "cloudflare",
    async generate(request) {
      const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(request.signal ? [request.signal] : [])]);

      /** A cancelled or timed-out call (the signal covers waiting for the answer and reading it) or any other failure to get one. */
      const failed = (err: unknown): AiProviderError => {
        if (request.signal?.aborted) return new AiProviderError("aborted", "The request was cancelled.");
        const stopped = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
        return stopped
          ? new AiProviderError("timeout", `The AI service did not answer within ${Math.round(timeoutMs / 1000)} seconds.`)
          : new AiProviderError("unavailable", "The AI service could not be reached.");
      };

      let response: Response;
      let body: unknown;
      try {
        response = await send(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messages: request.messages, max_tokens: request.maxTokens }),
          signal,
        });
        body = await response.json().catch((err: unknown) => {
          if (signal.aborted) throw err;
          return undefined; // not JSON: judged below by the status
        });
      } catch (err) {
        throw failed(err);
      }

      if (response.status === 429) throw new AiProviderError("rate_limited", "The AI service is limiting requests.", 429);
      if (response.status === 401 || response.status === 403) {
        throw new AiProviderError("rejected", "The AI service did not accept the credentials.", response.status);
      }
      const result = (body as { success?: unknown; result?: { response?: unknown; usage?: unknown } } | undefined);
      if (!response.ok || result?.success !== true) {
        throw new AiProviderError("unavailable", `The AI service answered with status ${response.status}.`, response.status);
      }
      const text = typeof result.result?.response === "string" ? result.result.response.trim() : "";
      if (text === "") throw new AiProviderError("unavailable", "The AI service sent an empty answer.", response.status);
      // Only the answer text and the usage figures are read. The raw answer also echoes the whole prompt back (`prompt_text`, `prompt_token_ids`), which is
      // issue text: it is never kept, logged or returned.
      return { text, usage: readUsage(result.result?.usage) };
    },
  };
}

/**
 * An answer from a function, for tests and for trying the panel with no account (`AI_DRIVER=fake`, never in production). It records every call,
 * so a test can read exactly what would have been sent to a real model.
 */
export function createFakeProvider(
  answer: (request: AiRequest) => string | Promise<string> = () => "This is a fake answer.",
): AiProvider & { calls: AiRequest[] } {
  const calls: AiRequest[] = [];
  return {
    name: "fake",
    calls,
    async generate(request) {
      calls.push(request);
      return { text: await answer(request) };
    },
  };
}
