import { env } from "../config/env.js";
import { createCloudflareProvider, createFakeProvider, type AiProvider } from "./ai.js";

/**
 * The provider the server uses, built once from the settings (ADR 0077). `undefined` means "Ask is not available": no `AI_DRIVER` is set, so the
 * endpoint answers that and the panel is hidden. The settings are checked at boot (`config/env.ts`): `cloudflare` cannot start without its account
 * id and token, and `fake` cannot start in production, so the non-null reads below cannot fail.
 */
let cached: AiProvider | null | undefined;

function build(): AiProvider | null {
  switch (env.AI_DRIVER) {
    case "cloudflare":
      return createCloudflareProvider({ accountId: env.CLOUDFLARE_ACCOUNT_ID!, token: env.CLOUDFLARE_AI_TOKEN!, model: env.AI_MODEL });
    case "fake":
      return createFakeProvider();
    default:
      return null;
  }
}

export function getAiProvider(): AiProvider | undefined {
  // `=== undefined`, not `??=`: "no provider" is stored as null, and `null ??= build()` would build one again on every call.
  if (cached === undefined) cached = build();
  return cached ?? undefined;
}

/** For tests only: replaces the provider (a fake that records calls, or `undefined` for "not available"). Pass `"reset"` to rebuild from the settings. */
export function setAiProviderForTests(provider: AiProvider | undefined | "reset"): void {
  cached = provider === "reset" ? undefined : (provider ?? null);
}
