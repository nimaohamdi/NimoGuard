import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile as nodeWriteFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Capability } from "@nimoguard/core";
import { InMemoryAuditSink } from "@nimoguard/audit";
import { guardedReadFile, guardedWriteFile, AuthorizationError } from "./fs-guard.js";

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "nimoguard-enforce-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("reads a file that is actually on disk when granted", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "notes.txt");
    await nodeWriteFile(filePath, "hello from disk", "utf8");

    const capabilities: Capability[] = [
      { id: "cap-1", agentId: "agent-1", action: "filesystem.read", scope: `${dir}/**` },
    ];

    const content = await guardedReadFile("agent-1", filePath, capabilities);
    assert.equal(content, "hello from disk");
  });
});

test("throws AuthorizationError and never reads the file when not granted", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "secret.txt");
    await nodeWriteFile(filePath, "should never be returned", "utf8");

    const sink = new InMemoryAuditSink();
    await assert.rejects(
      () => guardedReadFile("agent-1", filePath, [], sink),
      AuthorizationError,
    );
    assert.equal(sink.records[0]?.decision.decision, "DENY");
  });
});

test("writes a file that is actually on disk when granted", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "out.txt");
    const capabilities: Capability[] = [
      { id: "cap-1", agentId: "agent-1", action: "filesystem.write", scope: `${dir}/**` },
    ];

    await guardedWriteFile("agent-1", filePath, "written by nimoguard", capabilities);

    const { readFile } = await import("node:fs/promises");
    const onDisk = await readFile(filePath, "utf8");
    assert.equal(onDisk, "written by nimoguard");
  });
});

test("never writes to disk when not granted", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "blocked.txt");

    await assert.rejects(
      () => guardedWriteFile("agent-1", filePath, "should not land", []),
      AuthorizationError,
    );

    const { access } = await import("node:fs/promises");
    await assert.rejects(() => access(filePath));
  });
});
