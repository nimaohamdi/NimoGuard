import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL("./cli.js", import.meta.url));
const upstreamScript = fileURLToPath(new URL("./upstream-server.js", import.meta.url));

const TOKEN_VAR = "NIMOGUARD_TEST_APPROVAL_TOKEN";

async function withConfigFile(fn: (filePath: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "nimoguard-cli-approval-"));
  const filePath = path.join(dir, "nimoguard.config.json");
  const config = {
    agentId: "agent-1",
    upstreamServerName: "demo-upstream",
    upstreamCommand: "node",
    upstreamArgs: [upstreamScript],
    capabilities: [
      {
        id: "c1",
        agentId: "agent-1",
        action: "tool.call",
        scope: "mcp://demo-upstream/list_files",
        constraints: { requireApproval: true },
      },
    ],
    approval: {
      webhookUrl: "https://approvals.example.com/nimoguard",
      timeoutMs: 5000,
      authTokenEnv: TOKEN_VAR,
    },
  };
  try {
    await writeFile(filePath, JSON.stringify(config), "utf8");
    await fn(filePath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("exits 1 before starting anything when the approval token env var is not set", async () => {
  await withConfigFile(async (filePath) => {
    const env = { ...process.env };
    delete env[TOKEN_VAR];

    await assert.rejects(
      async () => execFileAsync("node", [cliPath, "--config", filePath], { env }),
      (err: unknown) => {
        const e = err as { code: number; stderr: string };
        assert.equal(e.code, 1);
        assert.match(e.stderr, new RegExp(`${TOKEN_VAR}.*not set`));
        return true;
      },
    );
  });
});

test("starts and stays running when the approval token env var is set", async () => {
  await withConfigFile(async (filePath) => {
    const env = { ...process.env, [TOKEN_VAR]: "test-token" };

    await assert.rejects(
      async () =>
        execFileAsync("node", [cliPath, "--config", filePath], { env, timeout: 1500 }),
      (err: unknown) => {
        const e = err as { killed?: boolean; signal?: string };
        return e.killed === true || e.signal === "SIGTERM";
      },
    );
  });
});
