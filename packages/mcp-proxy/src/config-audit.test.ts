import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig, ConfigError } from "./config.js";

async function withConfig(
  content: unknown,
  fn: (filePath: string) => Promise<void>,
) {
  const dir = await mkdtemp(path.join(tmpdir(), "nimoguard-audit-config-"));
  const filePath = path.join(dir, "nimoguard.config.json");
  try {
    await writeFile(filePath, JSON.stringify(content), "utf8");
    await fn(filePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const base = {
  agentId: "agent-1",
  upstreamServerName: "demo-upstream",
  upstreamCommand: "node",
  upstreamArgs: ["upstream.js"],
  capabilities: [
    { id: "c1", agentId: "agent-1", action: "tool.call", scope: "mcp://demo-upstream/echo" },
  ],
};

test("loads an auditLog block with path and includeArguments", async () => {
  await withConfig(
    { ...base, auditLog: { path: "/var/log/nimoguard/audit.jsonl", includeArguments: true } },
    async (filePath) => {
      const config = await loadConfig(filePath);
      assert.equal(config.auditLog?.path, "/var/log/nimoguard/audit.jsonl");
      assert.equal(config.auditLog?.includeArguments, true);
    },
  );
});

test("a config without auditLog has none", async () => {
  await withConfig(base, async (filePath) => {
    const config = await loadConfig(filePath);
    assert.equal(config.auditLog, undefined);
  });
});

test("rejects a relative auditLog path", async () => {
  await withConfig({ ...base, auditLog: { path: "logs/audit.jsonl" } }, async (filePath) => {
    await assert.rejects(() => loadConfig(filePath), /absolute/);
  });
});

test("rejects an auditLog without a path", async () => {
  await withConfig({ ...base, auditLog: { includeArguments: false } }, async (filePath) => {
    await assert.rejects(() => loadConfig(filePath), ConfigError);
  });
});

test("rejects a non-boolean includeArguments", async () => {
  await withConfig(
    { ...base, auditLog: { path: "/tmp/audit.jsonl", includeArguments: "yes" } },
    async (filePath) => {
      await assert.rejects(() => loadConfig(filePath), ConfigError);
    },
  );
});

test("rejects an auditLog that is not an object", async () => {
  await withConfig({ ...base, auditLog: "/tmp/audit.jsonl" }, async (filePath) => {
    await assert.rejects(() => loadConfig(filePath), ConfigError);
  });
});
