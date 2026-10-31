import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryAuditSink } from "@nimoguard/audit";
import type { AuditRecord } from "@nimoguard/audit";
import { withoutArguments } from "./audit-sink.js";

function record(metadata?: Record<string, unknown>): AuditRecord {
  return {
    requestId: "req-1",
    timestamp: "2026-09-23T12:00:00.000Z",
    request: {
      agentId: "agent-1",
      sessionId: "s-1",
      action: "tool.call",
      resource: "mcp://demo-upstream/echo",
      context: metadata === undefined ? undefined : { metadata },
    },
    decision: { decision: "ALLOW", reason: "Matching capability found" },
  };
}

test("strips arguments but keeps other metadata", async () => {
  const inner = new InMemoryAuditSink();
  await withoutArguments(inner).write(
    record({ arguments: { token: "secret" }, traceId: "abc" }),
  );

  const metadata = inner.records[0]?.request.context?.metadata;
  assert.equal(metadata?.["arguments"], undefined);
  assert.equal(metadata?.["traceId"], "abc");
});

test("passes a record without metadata through unchanged", async () => {
  const inner = new InMemoryAuditSink();
  const original = record();
  await withoutArguments(inner).write(original);

  assert.equal(inner.records[0], original);
});

test("does not mutate the original record", async () => {
  const inner = new InMemoryAuditSink();
  const original = record({ arguments: { token: "secret" } });
  await withoutArguments(inner).write(original);

  assert.deepEqual(original.request.context?.metadata?.["arguments"], { token: "secret" });
});
