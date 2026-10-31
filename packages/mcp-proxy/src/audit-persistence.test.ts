import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Capability } from "@nimoguard/core";
import { buildAuditSink } from "./audit-sink.js";
import { createProxy } from "./proxy-server.js";

const upstreamScript = fileURLToPath(new URL("./upstream-server.js", import.meta.url));

const capabilities: Capability[] = [
  { id: "cap-echo", agentId: "agent-1", action: "tool.call", scope: "mcp://demo-upstream/echo" },
];

async function withProxy(
  includeArguments: boolean | undefined,
  fn: (client: Client, logPath: string) => Promise<void>,
) {
  const dir = await mkdtemp(path.join(tmpdir(), "nimoguard-persist-"));
  const logPath = path.join(dir, "audit.jsonl");

  const sink = await buildAuditSink({ path: logPath, includeArguments });
  assert.ok(sink, "buildAuditSink should return a sink when auditLog is set");

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
  await Promise.all([proxyServer.connect(serverTransport), client.connect(clientTransport)]);

  try {
    await fn(client, logPath);
  } finally {
    await client.close();
    await proxyServer.close();
    await upstreamClient.close();
    await rm(dir, { recursive: true, force: true });
  }
}

async function readLines(logPath: string): Promise<string[]> {
  const text = await readFile(logPath, "utf8");
  return text.trim().split("\n");
}

test("an allowed call is persisted as one JSONL line, without its arguments", async () => {
  await withProxy(undefined, async (client, logPath) => {
    await client.callTool({ name: "echo", arguments: { text: "super-secret-value" } });

    const lines = await readLines(logPath);
    assert.equal(lines.length, 1);

    const record = JSON.parse(lines[0]!);
    assert.equal(record.decision.decision, "ALLOW");
    assert.equal(record.request.resource, "mcp://demo-upstream/echo");
    assert.ok(record.requestId);
    assert.ok(!lines[0]!.includes("super-secret-value"));
  });
});

test("arguments are persisted only when includeArguments is true", async () => {
  await withProxy(true, async (client, logPath) => {
    await client.callTool({ name: "echo", arguments: { text: "super-secret-value" } });

    const lines = await readLines(logPath);
    assert.ok(lines[0]!.includes("super-secret-value"));
  });
});

test("a denied call is persisted too", async () => {
  await withProxy(undefined, async (client, logPath) => {
    await client.callTool({ name: "read_file", arguments: { name: "notes.txt" } });

    const lines = await readLines(logPath);
    assert.equal(lines.length, 1);

    const record = JSON.parse(lines[0]!);
    assert.equal(record.decision.decision, "DENY");
    assert.equal(record.request.resource, "mcp://demo-upstream/read_file");
  });
});

