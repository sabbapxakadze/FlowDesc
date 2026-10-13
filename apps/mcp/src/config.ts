/**
 * What the server needs to start, read from the environment (a stdio MCP server has no login screen: the AI app that starts it passes
 * credentials as environment variables). Kept as a pure function so a test can check it without starting a process.
 */

export const DEFAULT_URL = "https://flowdesc.app";
export const TOKEN_PREFIX = "fd_pat_";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export type Config = { baseUrl: string; token: string };

export function readConfig(env: Record<string, string | undefined>): Config {
  const token = env.FLOWDESC_TOKEN?.trim();
  if (!token) {
    throw new ConfigError(
      "FLOWDESC_TOKEN is not set. Create an access token in FlowDesc (Account, Access tokens) and pass it to this server as FLOWDESC_TOKEN.",
    );
  }
  if (!token.startsWith(TOKEN_PREFIX)) {
    // Not echoed back: whatever is in the variable might be a different secret.
    throw new ConfigError(`FLOWDESC_TOKEN does not look like a FlowDesc access token (it should start with "${TOKEN_PREFIX}").`);
  }

  const raw = (env.FLOWDESC_URL?.trim() || DEFAULT_URL).replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`FLOWDESC_URL is not a valid address: ${raw}`);
  }
  // A token must never travel unencrypted to another machine. Plain http is only for a FlowDesc running on this computer.
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
    throw new ConfigError("FLOWDESC_URL must start with https:// (plain http:// is only accepted for localhost).");
  }
  return { baseUrl: `${url.protocol}//${url.host}`, token };
}
