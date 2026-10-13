import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ClientOptions } from "./client.js";
import { createServer } from "./server.js";

/**
 * For tests only (here and in apps/api): the real server wired to a real MCP client inside this process, no stdio and no child
 * process. It lives in this package so apps/api does not need the MCP SDK as a dependency of its own.
 */
export async function connectTestClient(options: ClientOptions & { clock?: () => Date }) {
  const server = createServer(options);
  const client = new Client({ name: "flowdesc-test", version: "1.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

  return {
    async listTools() {
      return (await client.listTools()).tools;
    },
    /** Calls a tool and hands back the first text block, whether it is an error, and a JSON reader for it. */
    async call(name: string, args: Record<string, unknown> = {}) {
      const result = await client.callTool({ name, arguments: args });
      const text = (result.content as { text: string }[])[0]?.text ?? "";
      return { text, isError: result.isError === true, json: () => JSON.parse(text) as unknown };
    },
    close: () => client.close(),
  };
}
