import test from "node:test";
import assert from "node:assert/strict";

import type {
  AuthorizationRequest,
  Capability,
} from "@nimoguard/core";

import { authorize } from "./engine.js";

const NOW = new Date("2026-09-23T12:00:00.000Z");

const capabilities: Capability[] = [
  {
    id: "cap-project-read",
    agentId: "agent-demo",
    action: "filesystem.read",
    scope: "/workspace/project/**",
  },
];

function makeRequest(
  overrides: Partial<AuthorizationRequest> = {},
): AuthorizationRequest {
  return {
    agentId: "agent-demo",
    sessionId: "session-demo",
    action: "filesystem.read",
    resource: "/workspace/project/src/index.ts",
    ...overrides,
  };
}

function makeCapability(overrides: Partial<Capability> = {}): Capability {
  return { ...capabilities[0]!, ...overrides };
}

test("allows a request covered by a capability", () => {
  const result = authorize(makeRequest(), capabilities, NOW);

  assert.equal(result.decision, "ALLOW");
  assert.equal(result.capabilityId, "cap-project-read");
});

test("denies a request outside every capability scope", () => {
  const result = authorize(
    makeRequest({ resource: "/home/nimo/.ssh/id_rsa" }),
    capabilities,
    NOW,
  );

  assert.equal(result.decision, "DENY");
  assert.equal(result.capabilityId, undefined);
});

test("denies when no capabilities exist", () => {
  const result = authorize(makeRequest(), [], NOW);

  assert.equal(result.decision, "DENY");
  assert.equal(result.reason, "No matching capability");
});

test("allows a capability that has not expired yet", () => {
  const result = authorize(
    makeRequest(),
    [makeCapability({ expiresAt: "2026-09-23T13:00:00.000Z" })],
    NOW,
  );

  assert.equal(result.decision, "ALLOW");
});

test("denies an expired capability", () => {
  const result = authorize(
    makeRequest(),
    [makeCapability({ expiresAt: "2026-09-23T11:00:00.000Z" })],
    NOW,
  );

  assert.equal(result.decision, "DENY");
  assert.equal(result.reason, "Matching capability expired or invalid");
});

test("denies a capability expiring exactly now", () => {
  const result = authorize(
    makeRequest(),
    [makeCapability({ expiresAt: NOW.toISOString() })],
    NOW,
  );

  assert.equal(result.decision, "DENY");
});

test("denies a capability with an unparseable expiresAt", () => {
  const result = authorize(
    makeRequest(),
    [makeCapability({ expiresAt: "not-a-date" })],
    NOW,
  );

  assert.equal(result.decision, "DENY");
  assert.equal(result.reason, "Matching capability expired or invalid");
});

test("requires approval when the matching capability demands it", () => {
  const result = authorize(
    makeRequest(),
    [makeCapability({ constraints: { requireApproval: true } })],
    NOW,
  );

  assert.equal(result.decision, "REQUIRE_APPROVAL");
  assert.equal(result.capabilityId, "cap-project-read");
});

test("denies expired capability even if it requires approval", () => {
  const result = authorize(
    makeRequest(),
    [
      makeCapability({
        constraints: { requireApproval: true },
        expiresAt: "2026-09-23T11:00:00.000Z",
      }),
    ],
    NOW,
  );

  assert.equal(result.decision, "DENY");
});

test("plain ALLOW wins when another matching capability does not require approval", () => {
  const result = authorize(
    makeRequest(),
    [
      makeCapability({ id: "cap-approval", constraints: { requireApproval: true } }),
      makeCapability({ id: "cap-plain" }),
    ],
    NOW,
  );

  assert.equal(result.decision, "ALLOW");
  assert.equal(result.capabilityId, "cap-plain");
});

test("ignores constraints without requireApproval", () => {
  const result = authorize(
    makeRequest(),
    [makeCapability({ constraints: { someOtherThing: "x" } })],
    NOW,
  );

  assert.equal(result.decision, "ALLOW");
});