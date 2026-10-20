import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig, ConfigError } from "./config.js";

async function withConfigFile(content: string, fn: (filePath: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "nimoguard-config-"));
  const filePath = path.join(dir, "nimoguard.config.json");
  try {
    await writeFile(filePath, content, "utf8");
    await fn(filePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const validConfig = {
  agentId: "agent-1",
  upstreamServerName: "demo-upstream",
  upstreamCommand: "node",
  upstreamArgs: ["dist/upstream-server.js"],
  capabilities: [
    { id: "cap-1", agentId: "agent-1", action: "tool.call", scope: "mcp://demo-upstream/echo" },
  ],
};

test("loads a valid config file", async () => {
  await withConfigFile(JSON.stringify(validConfig), async (filePath) => {
    const config = await loadConfig(filePath);
    assert.equal(config.agentId, "agent-1");
    assert.equal(config.capabilities.length, 1);
    assert.equal(config.capabilities[0]?.scope, "mcp://demo-upstream/echo");
  });
});

test("rejects a missing file with a clear ConfigError", async () => {
  await assert.rejects(
    () => loadConfig("/tmp/this-file-does-not-exist-nimoguard.json"),
    ConfigError,
  );
});

test("rejects invalid JSON", async () => {
  await withConfigFile("{ this is not valid json", async (filePath) => {
    await assert.rejects(() => loadConfig(filePath), ConfigError);
  });
});

test("rejects a config missing agentId", async () => {
  const { agentId, ...rest } = validConfig;
  await withConfigFile(JSON.stringify(rest), async (filePath) => {
    await assert.rejects(() => loadConfig(filePath), ConfigError);
  });
});

test("rejects a capability with an invalid action", async () => {
  const bad = {
    ...validConfig,
    capabilities: [{ id: "c1", agentId: "agent-1", action: "launch_missiles", scope: "x" }],
  };
  await withConfigFile(JSON.stringify(bad), async (filePath) => {
    await assert.rejects(() => loadConfig(filePath), ConfigError);
  });
});

test("rejects a capability missing scope", async () => {
  const bad = {
    ...validConfig,
    capabilities: [{ id: "c1", agentId: "agent-1", action: "tool.call" }],
  };
  await withConfigFile(JSON.stringify(bad), async (filePath) => {
    await assert.rejects(() => loadConfig(filePath), ConfigError);
  });
});

test("accepts a capability with expiresAt and constraints", async () => {
  const withExtras = {
    ...validConfig,
    capabilities: [
      {
        id: "c1",
        agentId: "agent-1",
        action: "tool.call",
        scope: "mcp://demo-upstream/echo",
        expiresAt: "2026-12-31T00:00:00Z",
        constraints: { requireApproval: true },
      },
    ],
  };
  await withConfigFile(JSON.stringify(withExtras), async (filePath) => {
    const config = await loadConfig(filePath);
    assert.equal(config.capabilities[0]?.expiresAt, "2026-12-31T00:00:00Z");
    assert.equal(config.capabilities[0]?.constraints?.["requireApproval"], true);
  });
});

test("rejects upstreamArgs that is not an array of strings", async () => {
  const bad = { ...validConfig, upstreamArgs: "not-an-array" };
  await withConfigFile(JSON.stringify(bad), async (filePath) => {
    await assert.rejects(() => loadConfig(filePath), ConfigError);
  });
});
