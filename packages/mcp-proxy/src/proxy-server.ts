import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Capability } from "@nimoguard/core";
import { authorizeAndAudit } from "@nimoguard/audit";
import type { AuditSink } from "@nimoguard/audit";
import { InMemoryAuditSink } from "@nimoguard/audit";

export interface ProxyOptions {
  upstreamServerName: string;
  upstreamCommand: string;
  upstreamArgs: string[];
  agentId: string;
  capabilities: Capability[];
  sink?: AuditSink;
}

export async function createProxy(options: ProxyOptions): Promise<{
  proxyServer: Server;
  upstreamClient: Client;
}> {
  const upstreamClient = new Client({ name: "nimoguard-proxy-client", version: "0.1.0" });
  const upstreamTransport = new StdioClientTransport({
    command: options.upstreamCommand,
    args: options.upstreamArgs,
  });
  await upstreamClient.connect(upstreamTransport);

  const sink = options.sink ?? new InMemoryAuditSink();
  const sessionId = `proxy-session-${Date.now()}`;

  const proxyServer = new Server(
    { name: "nimoguard-proxy", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  proxyServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return upstreamClient.listTools();
  });

  proxyServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const resource = `mcp://${options.upstreamServerName}/${toolName}`;

    const decision = await authorizeAndAudit(
      {
        agentId: options.agentId,
        sessionId,
        action: "tool.call",
        resource,
        context: { metadata: { arguments: request.params.arguments } },
      },
      options.capabilities,
      sink,
    );

    if (decision.decision !== "ALLOW") {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `NimoGuard blocked this call: ${decision.decision} — ${decision.reason}`,
          },
        ],
      };
    }

    return upstreamClient.callTool(request.params);
  });

  return { proxyServer, upstreamClient };
}

// Run standalone: node dist/proxy-server.js
if (import.meta.url === `file://${process.argv[1]}`) {
  const { proxyServer } = await createProxy({
    upstreamServerName: "demo-upstream",
    upstreamCommand: "node",
    upstreamArgs: [new URL("./upstream-server.js", import.meta.url).pathname],
    agentId: "agent-1",
    capabilities: [
      {
        id: "cap-echo",
        agentId: "agent-1",
        action: "tool.call",
        scope: "mcp://demo-upstream/echo",
      },
      {
        id: "cap-list",
        agentId: "agent-1",
        action: "tool.call",
        scope: "mcp://demo-upstream/list_files",
      },
      // Note: read_file is intentionally NOT granted, to demonstrate a DENY.
    ],
  });

  const transport = new StdioServerTransport();
  await proxyServer.connect(transport);
}
