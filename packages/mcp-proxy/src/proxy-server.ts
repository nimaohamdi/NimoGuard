import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Capability } from "@nimoguard/core";
import { authorizeWithApproval, InMemoryAuditSink } from "@nimoguard/audit";
import type { ApprovalHandler, AuditSink } from "@nimoguard/audit";

export interface ProxyOptions {
  upstreamServerName: string;
  upstreamCommand: string;
  upstreamArgs: string[];
  agentId: string;
  capabilities: Capability[];
  sink?: AuditSink;
  approvalHandler?: ApprovalHandler;
  approvalTimeoutMs?: number;
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

    const decision = await authorizeWithApproval(
      {
        agentId: options.agentId,
        sessionId,
        action: "tool.call",
        resource,
        context: { metadata: { arguments: request.params.arguments } },
      },
      options.capabilities,
      sink,
      {
        handler: options.approvalHandler,
        timeoutMs: options.approvalTimeoutMs,
      },
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