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
  const dir = await mkdtemp(path.join(tmpdir(), "nimoguard-approval-config-"));
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

test("loads a config with a full approval block", async () => {
  const cfg = {
    ...base,
    approval: {
      webhookUrl: "https://approvals.example.com/nimoguard",
      timeoutMs: 15000,
      authTokenEnv: "NIMOGUARD_APPROVAL_TOKEN",
    },
  };
  await withConfig(cfg, async (filePath) => {
    const config = await loadConfig(filePath);
    assert.equal(config.approval?.webhookUrl, "https://approvals.example.com/nimoguard");
    assert.equal(config.approval?.timeoutMs, 15000);
    assert.equal(config.approval?.authTokenEnv, "NIMOGUARD_APPROVAL_TOKEN");
  });
});

test("a config without approval still loads and has no approval", async () => {
  await withConfig(base, async (filePath) => {
    const config = await loadConfig(filePath);
    assert.equal(config.approval, undefined);
  });
});

test("rejects an approval block without webhookUrl", async () => {
  await withConfig({ ...base, approval: { timeoutMs: 1000 } }, async (filePath) => {
    await assert.rejects(() => loadConfig(filePath), ConfigError);
  });
});

test("rejects a plain-http webhook for a non-local host", async () => {
  await withConfig(
    { ...base, approval: { webhookUrl: "http://example.com/approve" } },
    async (filePath) => {
      await assert.rejects(() => loadConfig(filePath), /https/);
    },
  );
});

test("accepts a plain-http webhook for localhost", async () => {
  await withConfig(
    { ...base, approval: { webhookUrl: "http://127.0.0.1:8080/approve" } },
    async (filePath) => {
      const config = await loadConfig(filePath);
      assert.equal(config.approval?.webhookUrl, "http://127.0.0.1:8080/approve");
    },
  );
});

test("rejects an invalid timeoutMs", async () => {
  for (const timeoutMs of [0, -5, 1.5, "30"]) {
    await withConfig(
      { ...base, approval: { webhookUrl: "https://a.example.com/x", timeoutMs } },
      async (filePath) => {
        await assert.rejects(() => loadConfig(filePath), ConfigError);
      },
    );
  }
});

test("rejects an empty authTokenEnv", async () => {
  await withConfig(
    { ...base, approval: { webhookUrl: "https://a.example.com/x", authTokenEnv: "" } },
    async (filePath) => {
      await assert.rejects(() => loadConfig(filePath), ConfigError);
    },
  );
});
