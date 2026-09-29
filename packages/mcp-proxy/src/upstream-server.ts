import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const SANDBOX_DIR = path.resolve(import.meta.dirname, "..", "sandbox");

export function createUpstreamServer(): McpServer {
  const server = new McpServer({
    name: "nimoguard-demo-upstream",
    version: "0.1.0",
  });

  server.registerTool(
    "echo",
    {
      title: "Echo",
      description: "Echoes back the given text.",
      inputSchema: { text: z.string() },
    },
    async ({ text }) => ({
      content: [{ type: "text", text }],
    }),
  );

  server.registerTool(
    "list_files",
    {
      title: "List sandbox files",
      description: "Lists files in the demo sandbox directory.",
      inputSchema: {},
    },
    async () => {
      const files = await readdir(SANDBOX_DIR);
      return { content: [{ type: "text", text: files.join("\n") }] };
    },
  );

  server.registerTool(
    "read_file",
    {
      title: "Read sandbox file",
      description: "Reads a file from the demo sandbox directory.",
      inputSchema: { name: z.string() },
    },
    async ({ name }) => {
      const filePath = path.join(SANDBOX_DIR, name);
      const text = await readFile(filePath, "utf8");
      return { content: [{ type: "text", text }] };
    },
  );

  return server;
}

// Run standalone when executed directly (e.g. for manual testing).
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = createUpstreamServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
