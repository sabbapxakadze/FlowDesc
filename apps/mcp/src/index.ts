#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConfigError, readConfig } from "./config.js";
import { createServer } from "./server.js";

/**
 * What an AI app starts (ADR 0070): reads FLOWDESC_TOKEN and FLOWDESC_URL, then speaks MCP over stdin and stdout. stdout carries the
 * protocol, so anything meant for a person goes to stderr (console.error), and the token is never printed anywhere.
 */
async function main() {
  let config;
  try {
    config = readConfig(process.env);
  } catch (err) {
    console.error(err instanceof ConfigError ? err.message : "flowdesc-mcp could not start.");
    process.exit(1);
  }
  const server = createServer(config);
  await server.connect(new StdioServerTransport());
  console.error(`flowdesc-mcp is running (talking to ${new URL(config.baseUrl).host}).`);
}

main().catch(() => {
  console.error("flowdesc-mcp stopped because of an unexpected error.");
  process.exit(1);
});
