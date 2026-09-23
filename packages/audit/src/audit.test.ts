import { test } from "node:test";
import assert from "node:assert/strict";
import type { AuthorizationRequest, Capability } from "@nimoguard/core";
import { authorizeAndAudit } from "./audit.js";
import { InMemoryAuditSink } from "./sink.js";
import type { AuditRecord, AuditSink } from "./sink.js";

const request: AuthorizationRequest = {
  agentId: "agent-1",
  sessionId: "session-1",
  action: "filesystem.read",
  resource: "/workspace/project/file.txt",
};

const capabilities: Capability[] = [
  {
    id: "cap-1",
    agentId: "agent-1",
    action: "filesystem.read",
    scope: "/workspace/project/**",
  },
];

const now = new Date("2026-09-23T12:00:00.000Z");

test("records the decision in the sink with a requestId", async () => {
  const sink = new InMemoryAuditSink();
  const result = await authorizeAndAudit(request, capabilities, sink, now);

  assert.equal(result.decision, "ALLOW");
  assert.ok(result.requestId);
  assert.equal(sink.records.length, 1);
  assert.equal(sink.records[0]?.requestId, result.requestId);
  assert.equal(sink.records[0]?.timestamp, now.toISOString());
});

test("records DENY decisions too", async () => {
  const sink = new InMemoryAuditSink();
  const result = await authorizeAndAudit(request, [], sink, now);

  assert.equal(result.decision, "DENY");
  assert.equal(sink.records.length, 1);
  assert.equal(sink.records[0]?.decision.decision, "DENY");
});

test("fails closed when the sink throws", async () => {
  const failingSink: AuditSink = {
    async write(_record: AuditRecord): Promise<void> {
      throw new Error("disk full");
    },
  };
  const result = await authorizeAndAudit(request, capabilities, failingSink, now);

  assert.equal(result.decision, "DENY");
  assert.match(result.reason, /Audit logging failed/);
});
