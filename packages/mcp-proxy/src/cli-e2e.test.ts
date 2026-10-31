import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const cliPath = fileURLToPath(new URL("./cli.js", import.meta.url));
const upstreamScript = fileURLToPath(new URL("./upstream-server.js", import.meta.url));

const TOKEN_VAR = "NIMOGUARD_E2E_TOKEN";

interface WebhookCall {
  authorization: string | undefined;
  body: { resource?: string; requestId?: string };
}

// callTool returns a union type, so take `unknown` and narrow it ourselves.
function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text: string }> }).content;
  return content?.[0]?.text ?? "";
}

test("real client -> real CLI -> allow, deny, webhook approval, and a persisted audit log", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nimoguard-e2e-"));
  const logPath = path.join(dir, "audit.jsonl");
  const configPath = path.join(dir, "config.json");
  const webhookCalls: WebhookCall[] = [];

  const webhook = http.createServer((req, res) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      webhookCalls.push({
        authorization: req.headers["authorization"],
        body: JSON.parse(data),
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ approved: true }));
    });
  });

  await new Promise<void>((resolve) => webhook.listen(0, "127.0.0.1", resolve));
  const { port } = webhook.address() as AddressInfo;

  const config = {
    agentId: "agent-1",
    upstreamServerName: "demo-upstream",
    upstreamCommand: "node",
    upstreamArgs: [upstreamScript],
    capabilities: [
      { id: "cap-echo", agentId: "agent-1", action: "tool.call", scope: "mcp://demo-upstream/echo" },
      {
        id: "cap-list",
        agentId: "agent-1",
        action: "tool.call",
        scope: "mcp://demo-upstream/list_files",
        constraints: { requireApproval: true },
      },
    ],
    approval: {
      webhookUrl: `http://127.0.0.1:${port}/approve`,
      timeoutMs: 5000,
      authTokenEnv: TOKEN_VAR,
    },
    auditLog: { path: logPath },
  };
  await writeFile(configPath, JSON.stringify(config), "utf8");

  const transport = new StdioClientTransport({
    command: "node",
    args: [cliPath, "--config", configPath],
    env: { [TOKEN_VAR]: "e2e-token" },
  });
  const client = new Client({ name: "e2e-agent", version: "0.1.0" });

  try {
    await client.connect(transport);

    // 1. Granted tool: forwarded to the real upstream and really runs.
    const echo = await client.callTool({
      name: "echo",
      arguments: { text: "super-secret-value" },
    });
    assert.equal(echo.isError, undefined);
    assert.equal(textOf(echo), "super-secret-value");

    // 2. Never granted: blocked before upstream.
    const denied = await client.callTool({
      name: "read_file",
      arguments: { name: "notes.txt" },
    });
    assert.equal(denied.isError, true);
    assert.match(textOf(denied), /NimoGuard blocked/);

    // 3. Needs approval: the webhook approves, so it runs for real.
    const listed = await client.callTool({ name: "list_files", arguments: {} });
    assert.equal(listed.isError, undefined);
    assert.match(textOf(listed), /notes\.txt/);

    // The webhook saw exactly one request, with the token from the environment.
    assert.equal(webhookCalls.length, 1);
    assert.equal(webhookCalls[0]?.authorization, "Bearer e2e-token");
    assert.equal(webhookCalls[0]?.body.resource, "mcp://demo-upstream/list_files");

    // The audit log on disk matches what happened, in order.
    const text = await readFile(logPath, "utf8");
    const records = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));

    assert.deepEqual(
      records.map((r) => [r.request.resource, r.decision.decision]),
      [
        ["mcp://demo-upstream/echo", "ALLOW"],
        ["mcp://demo-upstream/read_file", "DENY"],
        ["mcp://demo-upstream/list_files", "REQUIRE_APPROVAL"],
        ["mcp://demo-upstream/list_files", "ALLOW"],
      ],
    );

    // The approval pair shares one requestId.
    assert.equal(records[2].requestId, records[3].requestId);

    // Arguments are off by default, so the echoed secret never reached the file.
    assert.ok(!text.includes("super-secret-value"));
  } finally {
    await client.close();
    webhook.closeAllConnections();
    await new Promise<void>((resolve) => webhook.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});