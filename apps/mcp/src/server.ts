import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { FlowDescClient, type ClientOptions } from "./client.js";
import { registerTools } from "./tools.js";

export { readConfig, ConfigError, type Config } from "./config.js";
export { FlowDescClient, FlowDescError } from "./client.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

/**
 * The MCP server with every tool registered, not yet connected to anything: the stdio entry point (index.ts) connects it to the AI
 * app, and tests connect it to an in-memory client. Nothing here writes to stdout (that is the protocol's channel).
 */
export function createServer(options: ClientOptions & { clock?: () => Date }): McpServer {
  const server = new McpServer({ name: "flowdesc", version });
  registerTools(server, new FlowDescClient(options), { clock: options.clock });
  return server;
}
