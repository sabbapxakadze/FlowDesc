import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { standardAnswer, startFakeApi } from "./fake-api.js";

/**
 * The real thing as an AI app runs it: a child process started with environment variables, spoken to over stdin and stdout. The
 * other tests connect in memory; only this one proves the start-up file, the environment handling and that stdout carries nothing but
 * protocol messages (a stray console.log would break every client).
 */

const TOKEN = "fd_pat_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));
const NODE_ARGS = ["--import", "tsx", "src/index.ts"];

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

describe("the server as a child process", () => {
  it("starts from environment variables, lists its tools and answers a call over real stdio", async () => {
    const api = await startFakeApi(standardAnswer);
    closers.push(() => api.close());
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: NODE_ARGS,
      cwd: PACKAGE_DIR,
      env: { ...getDefaultEnvironment(), FLOWDESC_TOKEN: TOKEN, FLOWDESC_URL: api.url },
      stderr: "pipe",
    });
    let stderr = "";
    const client = new Client({ name: "stdio-test", version: "1.0.0" });
    await client.connect(transport);
    transport.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    closers.push(() => client.close());

    const { tools } = await client.listTools();
    expect(tools).toHaveLength(12);
    const result = await client.callTool({ name: "whoami", arguments: {} });
    expect((result.content as { text: string }[])[0]!.text).toContain("Olivia Owner");
    expect(api.requests[0]!.authorization).toBe(`Bearer ${TOKEN}`);

    await client.close();
    expect(stderr).not.toContain(TOKEN); // the token is never printed, even in the start-up line
  });

  it("refuses to start without a token: exit code 1, a plain message on stderr, nothing on stdout", async () => {
    // Why: an AI app shows stderr when a server fails to start; stdout must stay clean even then.
    const child = spawn(process.execPath, NODE_ARGS, { cwd: PACKAGE_DIR, env: { ...getDefaultEnvironment() } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("FLOWDESC_TOKEN is not set");
  });
});
