import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile as nodeWriteFile, symlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Capability } from "@nimoguard/core";
import { InMemoryAuditSink } from "@nimoguard/audit";
import { guardedReadFile, AuthorizationError } from "./fs-guard.js";

async function withTempDir(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "nimoguard-symlink-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("denies reading through a symlink that escapes the granted directory", async () => {
  await withTempDir(async (base) => {
    const allowedDir = path.join(base, "allowed");
    const secretDir = path.join(base, "secret");
    await mkdir(allowedDir);
    await mkdir(secretDir);

    const secretFile = path.join(secretDir, "password.txt");
    await nodeWriteFile(secretFile, "top secret", "utf8");

    // A symlink *inside* the allowed directory that points outside it.
    const linkPath = path.join(allowedDir, "sneaky-link.txt");
    await symlink(secretFile, linkPath);

    const capabilities: Capability[] = [
      { id: "cap-1", agentId: "agent-1", action: "filesystem.read", scope: `${allowedDir}/**` },
    ];

    const sink = new InMemoryAuditSink();
    await assert.rejects(
      () => guardedReadFile("agent-1", linkPath, capabilities, sink),
      AuthorizationError,
    );
  });
});

test("allows reading through a symlink that stays inside the granted directory", async () => {
  await withTempDir(async (base) => {
    const allowedDir = path.join(base, "allowed");
    await mkdir(allowedDir);

    const realFile = path.join(allowedDir, "real.txt");
    await nodeWriteFile(realFile, "inside scope", "utf8");

    const linkPath = path.join(allowedDir, "link.txt");
    await symlink(realFile, linkPath);

    const capabilities: Capability[] = [
      { id: "cap-1", agentId: "agent-1", action: "filesystem.read", scope: `${allowedDir}/**` },
    ];

    const content = await guardedReadFile("agent-1", linkPath, capabilities);
    assert.equal(content, "inside scope");
  });
});

test("denies a plain path with no symlink as before (regression check)", async () => {
  await withTempDir(async (base) => {
    const capabilities: Capability[] = [];
    await assert.rejects(
      () => guardedReadFile("agent-1", path.join(base, "nope.txt"), capabilities),
      AuthorizationError,
    );
  });
});
