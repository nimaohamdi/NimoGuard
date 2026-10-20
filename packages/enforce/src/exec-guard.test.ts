import { test } from "node:test";
import assert from "node:assert/strict";
import type { Capability } from "@nimoguard/core";
import { InMemoryAuditSink } from "@nimoguard/audit";
import { guardedExec } from "./exec-guard.js";
import { AuthorizationError } from "./fs-guard.js";

const capabilities: Capability[] = [
  { id: "cap-echo", agentId: "agent-1", action: "command.execute", scope: "echo" },
];

test("actually runs the command when granted", async () => {
  const { stdout } = await guardedExec("agent-1", "echo hello-from-nimoguard", capabilities);
  assert.match(stdout, /hello-from-nimoguard/);
});

test("throws without running anything when not granted", async () => {
  const sink = new InMemoryAuditSink();
  await assert.rejects(
    () => guardedExec("agent-1", "rm -rf /tmp/should-not-run", [], sink),
    AuthorizationError,
  );
  assert.equal(sink.records[0]?.decision.decision, "DENY");
});

test("rejects a chained command even though the first token is allowed", async () => {
  await assert.rejects(
    () => guardedExec("agent-1", "echo hi; echo should-not-run-separately", capabilities),
    AuthorizationError,
  );
});

test("denies command substitution before ever executing", async () => {
  await assert.rejects(
    () => guardedExec("agent-1", "echo $(echo pwned)", capabilities),
    AuthorizationError,
  );
});