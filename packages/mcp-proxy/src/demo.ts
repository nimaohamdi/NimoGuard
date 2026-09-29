import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Capability } from "@nimoguard/core";
import { InMemoryAuditSink } from "@nimoguard/audit";
import { createProxy } from "./proxy-server.js";

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const upstreamScript = fileURLToPath(new URL("./upstream-server.js", import.meta.url));

const capabilities: Capability[] = [
  {
    id: "cap-echo",
    agentId: "agent-1",
    action: "tool.call",
    scope: "mcp://demo-upstream/echo",
  },
  {
    id: "cap-list-approval",
    agentId: "agent-1",
    action: "tool.call",
    scope: "mcp://demo-upstream/list_files",
    constraints: { requireApproval: true },
  },
  // read_file is intentionally not granted at all.
];

const sink = new InMemoryAuditSink();

const { proxyServer, upstreamClient } = await createProxy({
  upstreamServerName: "demo-upstream",
  upstreamCommand: "node",
  upstreamArgs: [upstreamScript],
  agentId: "agent-1",
  capabilities,
  sink,
});

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const agent = new Client({ name: "demo-agent", version: "0.1.0" });

await Promise.all([
  proxyServer.connect(serverTransport),
  agent.connect(clientTransport),
]);

console.log("\nNimoGuard MCP proxy demo\n");

console.log(dim("Agent asks the proxy which tools are available..."));
const { tools } = await agent.listTools();
console.log(`Upstream exposes: ${tools.map((t) => t.name).join(", ")}\n`);

async function tryCall(title: string, name: string, args: Record<string, unknown>) {
  const result = await agent.callTool({ name, arguments: args });
  const isBlocked = result.isError === true;
  const content = result.content as Array<{ type: string; text: string }>;
  const text = content[0]?.text ?? "";

  const tag = isBlocked
    ? text.includes("REQUIRE_APPROVAL")
      ? yellow("APPROVAL")
      : red("DENY ")
    : green("ALLOW");

  console.log(`${tag}  ${title}`);
  console.log(dim(`       tool: ${name}  args: ${JSON.stringify(args)}`));
  console.log(dim(`       ${text}`));
}

await tryCall("Echo a greeting (granted)", "echo", { text: "hello from the agent" });
await tryCall("List sandbox files (requires human approval)", "list_files", {});
await tryCall("Read a sandbox file (not granted at all)", "read_file", { name: "notes.txt" });
await tryCall("Call an unknown tool", "delete_everything", {});

console.log(`\n${sink.records.length} decisions recorded in the audit sink.\n`);

await agent.close();
await proxyServer.close();
await upstreamClient.close();
