import { describe, expect, it } from "vitest";
import type { ApiToken } from "@flowdesc/contracts";
import { MCP_ACTIVE_WINDOW_MS, describeMcpStatus, isMcpActive, mcpState } from "./mcpStatus";

const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const later = (ms: number) => new Date(NOW + ms).toISOString();

function token(overrides: Partial<ApiToken> = {}): ApiToken {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "t",
    scope: "read",
    createdAt: ago(86_400_000),
    expiresAt: later(86_400_000),
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

describe("is an AI app using the account's token right now", () => {
  it("is in use when a working token was used a minute ago", () => {
    // Why: the whole point of the green dot.
    expect(mcpState([token({ lastUsedAt: ago(60_000) })], NOW)).toBe("in-use");
  });

  it("is idle after the window, and the window's edge still counts", () => {
    // Why: pins the 5-minute rule in both directions, so a change to it has to be deliberate.
    expect(isMcpActive([token({ lastUsedAt: ago(MCP_ACTIVE_WINDOW_MS) })], NOW)).toBe(true);
    expect(isMcpActive([token({ lastUsedAt: ago(MCP_ACTIVE_WINDOW_MS + 1_000) })], NOW)).toBe(false);
    expect(mcpState([token({ lastUsedAt: ago(6 * 60_000) })], NOW)).toBe("idle");
  });

  it("ignores a revoked token even if it was used a second ago", () => {
    // Why: a revoked token cannot be in use; a green dot for it would say the opposite of what the person just did.
    const revoked = token({ lastUsedAt: ago(1_000), revokedAt: ago(500) });
    expect(isMcpActive([revoked], NOW)).toBe(false);
    expect(mcpState([revoked], NOW)).toBe("no-token");
  });

  it("ignores an expired token", () => {
    // Why: same as revoked, by date.
    const expired = token({ lastUsedAt: ago(1_000), expiresAt: ago(500) });
    expect(isMcpActive([expired], NOW)).toBe(false);
    expect(mcpState([expired], NOW)).toBe("no-token");
  });

  it("separates 'no token yet' from 'a token that nothing has used'", () => {
    // Why: the first asks the person to set one up, the second does not.
    expect(mcpState([], NOW)).toBe("no-token");
    expect(mcpState([token()], NOW)).toBe("idle");
  });

  it("is in use if any one of several tokens was used lately", () => {
    // Why: people keep a token per computer.
    const tokens = [token({ id: "a", lastUsedAt: ago(3_600_000) }), token({ id: "b", lastUsedAt: ago(30_000) }), token({ id: "c" })];
    expect(isMcpActive(tokens, NOW)).toBe(true);
  });
});

describe("the sentence for the tooltip and screen readers", () => {
  it("says each state in words and how long ago", () => {
    // Why: colour alone must never carry the state (accessibility), and the minutes tell the person whether it was them.
    expect(describeMcpStatus([], NOW)).toContain("no access token yet");
    expect(describeMcpStatus([token()], NOW)).toContain("no recent activity");
    expect(describeMcpStatus([token({ lastUsedAt: ago(10_000) })], NOW)).toContain("just now");
    expect(describeMcpStatus([token({ lastUsedAt: ago(70_000) })], NOW)).toContain("1 minute ago");
    expect(describeMcpStatus([token({ lastUsedAt: ago(3 * 60_000 + 5_000) })], NOW)).toContain("3 minutes ago");
  });
});
