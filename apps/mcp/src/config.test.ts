import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULT_URL, readConfig } from "./config.js";

const TOKEN = "fd_pat_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

describe("readConfig", () => {
  it("needs a token, and says where to get one", () => {
    // Why: the most common first-run mistake. The message must point at the fix, since the AI app only shows it as a start-up failure.
    expect(() => readConfig({})).toThrow(ConfigError);
    expect(() => readConfig({ FLOWDESC_TOKEN: "   " })).toThrow(/Access tokens/);
  });

  it("refuses a value that is not a FlowDesc token, without printing it", () => {
    // Why: a pasted password or another service's key in this variable must not be echoed into a log.
    const secret = "sk-not-a-flowdesc-token";
    expect(() => readConfig({ FLOWDESC_TOKEN: secret })).toThrow(/does not look like a FlowDesc access token/);
    try {
      readConfig({ FLOWDESC_TOKEN: secret });
    } catch (err) {
      expect((err as Error).message).not.toContain(secret);
    }
  });

  it("uses flowdesc.app by default and trims the address", () => {
    expect(readConfig({ FLOWDESC_TOKEN: TOKEN }).baseUrl).toBe(DEFAULT_URL);
    expect(readConfig({ FLOWDESC_TOKEN: TOKEN, FLOWDESC_URL: "https://flowdesc.app///" }).baseUrl).toBe("https://flowdesc.app");
    expect(readConfig({ FLOWDESC_TOKEN: ` ${TOKEN} ` }).token).toBe(TOKEN);
  });

  it("accepts plain http only for this computer", () => {
    // Why: a token sent over http to another machine can be read on the way. Local development is the one honest use of http.
    expect(readConfig({ FLOWDESC_TOKEN: TOKEN, FLOWDESC_URL: "http://localhost:4000" }).baseUrl).toBe("http://localhost:4000");
    expect(readConfig({ FLOWDESC_TOKEN: TOKEN, FLOWDESC_URL: "http://127.0.0.1:4000" }).baseUrl).toBe("http://127.0.0.1:4000");
    expect(() => readConfig({ FLOWDESC_TOKEN: TOKEN, FLOWDESC_URL: "http://flowdesc.app" })).toThrow(/https/);
    expect(() => readConfig({ FLOWDESC_TOKEN: TOKEN, FLOWDESC_URL: "http://localhost.evil.example" })).toThrow(/https/);
    expect(() => readConfig({ FLOWDESC_TOKEN: TOKEN, FLOWDESC_URL: "ftp://flowdesc.app" })).toThrow(/https/);
    expect(() => readConfig({ FLOWDESC_TOKEN: TOKEN, FLOWDESC_URL: "not a url" })).toThrow(/not a valid address/);
  });
});
