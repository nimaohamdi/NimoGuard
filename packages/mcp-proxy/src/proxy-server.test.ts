import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Capability } from "@nimoguard/core";
import { InMemoryAuditSink } from "@nimoguard/audit";
import { createProxy } from "./proxy-server.js";

const upstreamScript = fileURLToPath(new URL("./upstream-server.js", import.meta.url));

const capabilities: Capability[] = [
  {
    id: "cap-echo",
    agentId: "agent-1",
    action: "tool.call",
    scope: "mcp://demo-upstream/echo",
  },
];

async function connectedProxyClient(sink = new InMemoryAuditSink()) {
  const { proxyServer, upstreamClient } = await createProxy({
    upstreamServerName: "demo-upstream",
    upstreamCommand: "node",
    upstreamArgs: [upstreamScript],
    agentId: "agent-1",
    capabilities,
    sink,
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-agent", version: "0.1.0" });

  await Promise.all([
    proxyServer.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return {
    client,
    sink,
    async cleanup() {
      await client.close();
      await proxyServer.close();
      await upstreamClient.close();
    },
  };
}

test("lists tools by forwarding to upstream", async () => {
  const { client, cleanup } = await connectedProxyClient();
  try {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name).sort();

    assert.deepEqual(names, ["echo", "list_files", "read_file"]);
  } finally {
    await cleanup();
  }
});

test("allows a granted tool call and forwards it to upstream", async () => {
  const { client, sink, cleanup } = await connectedProxyClient();
  try {
    const result = await client.callTool({ name: "echo", arguments: { text: "hello" } });

    assert.equal(result.isError, undefined);
    const content = result.content as Array<{ type: string; text: string }>;
    assert.equal(content[0]?.text, "hello");
    assert.equal(sink.records.length, 1);
    assert.equal(sink.records[0]?.decision.decision, "ALLOW");
  } finally {
    await cleanup();
  }
});

test("denies a tool call with no matching capability, without calling upstream", async () => {
  const { client, sink, cleanup } = await connectedProxyClient();
  try {
    const result = await client.callTool({ name: "read_file", arguments: { name: "notes.txt" } });

    assert.equal(result.isError, true);
    const content = result.content as Array<{ type: string; text: string }>;
    assert.match(content[0]?.text ?? "", /NimoGuard blocked/);
    assert.equal(sink.records.length, 1);
    assert.equal(sink.records[0]?.decision.decision, "DENY");
  } finally {
    await cleanup();
  }
});