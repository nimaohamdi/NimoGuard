import { test } from "node:test";
import assert from "node:assert/strict";
import type { AuthorizationRequest, Capability } from "@nimoguard/core";
import { authorizeWithApproval } from "./approval.js";
import { InMemoryAuditSink } from "./sink.js";
import type { AuditRecord, AuditSink } from "./sink.js";

const request: AuthorizationRequest = {
  agentId: "agent-1",
  sessionId: "session-1",
  action: "filesystem.read",
  resource: "/workspace/project/file.txt",
};

const needsApproval: Capability[] = [
  {
    id: "cap-approval",
    agentId: "agent-1",
    action: "filesystem.read",
    scope: "/workspace/project/**",
    constraints: { requireApproval: true },
  },
];

const plainAllow: Capability[] = [
  {
    id: "cap-plain",
    agentId: "agent-1",
    action: "filesystem.read",
    scope: "/workspace/project/**",
  },
];

const now = new Date("2026-09-23T12:00:00.000Z");

test("approved by the handler becomes ALLOW and is audited twice", async () => {
  const sink = new InMemoryAuditSink();
  const result = await authorizeWithApproval(request, needsApproval, sink, {
    handler: async () => true,
    now,
  });

  assert.equal(result.decision, "ALLOW");
  assert.equal(result.capabilityId, "cap-approval");
  assert.equal(sink.records.length, 2);
  assert.equal(sink.records[0]?.decision.decision, "REQUIRE_APPROVAL");
  assert.equal(sink.records[1]?.decision.decision, "ALLOW");
  assert.equal(sink.records[0]?.requestId, sink.records[1]?.requestId);
});

test("rejected by the handler becomes DENY", async () => {
  const sink = new InMemoryAuditSink();
  const result = await authorizeWithApproval(request, needsApproval, sink, {
    handler: async () => false,
    now,
  });

  assert.equal(result.decision, "DENY");
  assert.match(result.reason, /rejected/);
  assert.equal(sink.records[1]?.decision.decision, "DENY");
});

test("a handler that throws fails closed", async () => {
  const sink = new InMemoryAuditSink();
  const result = await authorizeWithApproval(request, needsApproval, sink, {
    handler: async () => {
      throw new Error("approval service down");
    },
    now,
  });

  assert.equal(result.decision, "DENY");
  assert.match(result.reason, /handler failed/);
});

test("a handler that never answers times out and fails closed", async () => {
  const sink = new InMemoryAuditSink();
  const result = await authorizeWithApproval(request, needsApproval, sink, {
    handler: () => new Promise<boolean>(() => {}),
    timeoutMs: 50,
    now,
  });

  assert.equal(result.decision, "DENY");
  assert.match(result.reason, /timed out/);
});

test("with no handler, REQUIRE_APPROVAL is returned unchanged", async () => {
  const sink = new InMemoryAuditSink();
  const result = await authorizeWithApproval(request, needsApproval, sink, { now });

  assert.equal(result.decision, "REQUIRE_APPROVAL");
  assert.equal(sink.records.length, 1);
});

test("the handler is not called for a plain ALLOW", async () => {
  const sink = new InMemoryAuditSink();
  let calls = 0;
  const result = await authorizeWithApproval(request, plainAllow, sink, {
    handler: async () => {
      calls += 1;
      return true;
    },
    now,
  });

  assert.equal(result.decision, "ALLOW");
  assert.equal(calls, 0);
});

test("the handler is not called for a DENY", async () => {
  const sink = new InMemoryAuditSink();
  let calls = 0;
  const result = await authorizeWithApproval(request, [], sink, {
    handler: async () => {
      calls += 1;
      return true;
    },
    now,
  });

  assert.equal(result.decision, "DENY");
  assert.equal(calls, 0);
});

test("fails closed if the final audit write fails after approval", async () => {
  let writes = 0;
  const flakySink: AuditSink = {
    async write(_record: AuditRecord): Promise<void> {
      writes += 1;
      if (writes === 2) {
        throw new Error("disk full");
      }
    },
  };

  const result = await authorizeWithApproval(request, needsApproval, flakySink, {
    handler: async () => true,
    now,
  });

  assert.equal(result.decision, "DENY");
  assert.match(result.reason, /Audit logging failed/);
});
