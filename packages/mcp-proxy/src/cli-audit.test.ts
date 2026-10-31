import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL("./cli.js", import.meta.url));
const upstreamScript = fileURLToPath(new URL("./upstream-server.js", import.meta.url));

async function withDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "nimoguard-cli-audit-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function configWithLog(logPath: string) {
  return {
    agentId: "agent-1",
    upstreamServerName: "demo-upstream",
    upstreamCommand: "node",
    upstreamArgs: [upstreamScript],
    capabilities: [
      { id: "c1", agentId: "agent-1", action: "tool.call", scope: "mcp://demo-upstream/echo" },
    ],
    auditLog: { path: logPath },
  };
}

test("exits 1 before starting when the audit log path is not writable", async () => {
  await withDir(async (dir) => {
    const blocker = path.join(dir, "blocker");
    await writeFile(blocker, "a file, not a directory", "utf8");

    const configPath = path.join(dir, "config.json");
    await writeFile(
      configPath,
      JSON.stringify(configWithLog(path.join(blocker, "audit.jsonl"))),
      "utf8",
    );

    await assert.rejects(
      async () => execFileAsync("node", [cliPath, "--config", configPath]),
      (err: unknown) => {
        const e = err as { code: number; stderr: string };
        assert.equal(e.code, 1);
        assert.match(e.stderr, /not writable/);
        return true;
      },
    );
  });
});

test("creates the audit log file with owner-only permissions at startup", async () => {
  await withDir(async (dir) => {
    const logPath = path.join(dir, "logs", "audit.jsonl");
    const configPath = path.join(dir, "config.json");
    await writeFile(configPath, JSON.stringify(configWithLog(logPath)), "utf8");

    await assert.rejects(
      async () => execFileAsync("node", [cliPath, "--config", configPath], { timeout: 1500 }),
      (err: unknown) => {
        const e = err as { killed?: boolean; signal?: string };
        return e.killed === true || e.signal === "SIGTERM";
      },
    );

    const info = await stat(logPath);
    assert.equal(info.mode & 0o777, 0o600);
  });
});
