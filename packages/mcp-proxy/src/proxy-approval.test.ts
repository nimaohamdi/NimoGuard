import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Capability } from "@nimoguard/core";
import { InMemoryAuditSink } from "@nimoguard/audit";
import type { ApprovalHandler } from "@nimoguard/audit";
import { createProxy } from "./proxy-server.js";

const upstreamScript = fileURLToPath(new URL("./upstream-server.js", import.meta.url));

const capabilities: Capability[] = [
  {
    id: "cap-list-approval",
    agentId: "agent-1",
    action: "tool.call",
    scope: "mcp://demo-upstream/list_files",
    constraints: { requireApproval: true },
  },
];

async function connect(approvalHandler?: ApprovalHandler) {
  const sink = new InMemoryAuditSink();
  const { proxyServer, upstreamClient } = await createProxy({
    upstreamServerName: "demo-upstream",
    upstreamCommand: "node",
    upstreamArgs: [upstreamScript],
    agentId: "agent-1",
    capabilities,
    sink,
    approvalHandler,
    approvalTimeoutMs: 2000,
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

test("an approved call is forwarded to upstream and really runs", async () => {
  const { client, sink, cleanup } = await connect(async () => true);
  try {
    const result = await client.callTool({ name: "list_files", arguments: {} });

    assert.equal(result.isError, undefined);
    const content = result.content as Array<{ type: string; text: string }>;
    assert.match(content[0]?.text ?? "", /notes\.txt/);
    assert.equal(sink.records.length, 2);
    assert.equal(sink.records[0]?.decision.decision, "REQUIRE_APPROVAL");
    assert.equal(sink.records[1]?.decision.decision, "ALLOW");
  } finally {
    await cleanup();
  }
});

test("a rejected call is blocked and never reaches upstream", async () => {
  const { client, sink, cleanup } = await connect(async () => false);
  try {
    const result = await client.callTool({ name: "list_files", arguments: {} });

    assert.equal(result.isError, true);
    const content = result.content as Array<{ type: string; text: string }>;
    assert.match(content[0]?.text ?? "", /NimoGuard blocked/);
    assert.doesNotMatch(content[0]?.text ?? "", /notes\.txt/);
    assert.equal(sink.records[1]?.decision.decision, "DENY");
  } finally {
    await cleanup();
  }
});

test("without a handler, REQUIRE_APPROVAL stays blocked", async () => {
  const { client, cleanup } = await connect();
  try {
    const result = await client.callTool({ name: "list_files", arguments: {} });

    assert.equal(result.isError, true);
    const content = result.content as Array<{ type: string; text: string }>;
    assert.match(content[0]?.text ?? "", /REQUIRE_APPROVAL/);
  } finally {
    await cleanup();
  }
});

test("the handler receives the tool resource it is asked to approve", async () => {
  let seenResource = "";
  const { client, cleanup } = await connect(async ({ request }) => {
    seenResource = request.resource;
    return true;
  });
  try {
    await client.callTool({ name: "list_files", arguments: {} });
    assert.equal(seenResource, "mcp://demo-upstream/list_files");
  } finally {
    await cleanup();
  }
});
