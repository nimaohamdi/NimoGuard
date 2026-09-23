import test from "node:test";
import assert from "node:assert/strict";

import type {
  AuthorizationRequest,
  Capability,
} from "@nimoguard/core";

import { matchesCapability } from "./matcher.js";

const capability: Capability = {
  id: "cap-project-read",
  agentId: "agent-demo",
  action: "filesystem.read",
  scope: "/workspace/project/**",
};

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

test("allows reading a resource inside the capability scope", () => {
  assert.equal(matchesCapability(makeRequest(), capability), true);
});

test("denies reading a resource outside the capability scope", () => {
  const request = makeRequest({ resource: "/home/nimo/.ssh/id_rsa" });
  assert.equal(matchesCapability(request, capability), false);
});

test("denies a different agent", () => {
  const request = makeRequest({ agentId: "attacker-agent" });
  assert.equal(matchesCapability(request, capability), false);
});

test("denies a different action", () => {
  const request = makeRequest({ action: "filesystem.write" });
  assert.equal(matchesCapability(request, capability), false);
});

test("denies path traversal outside the capability scope", () => {
  const request = makeRequest({
    resource: "/workspace/project/../.ssh/id_rsa",
  });
  assert.equal(matchesCapability(request, capability), false);
});

test("allows the capability root itself", () => {
  const request = makeRequest({ resource: "/workspace/project" });
  assert.equal(matchesCapability(request, capability), true);
});

test("denies a sibling path with a similar prefix", () => {
  const request = makeRequest({ resource: "/workspace/project2/file.txt" });
  assert.equal(matchesCapability(request, capability), false);
});

test("denies another sibling path with a similar prefix", () => {
  const request = makeRequest({ resource: "/workspace/projects/file.txt" });
  assert.equal(matchesCapability(request, capability), false);
});

test("denies a relative resource path", () => {
  const request = makeRequest({
    resource: "workspace/project/src/index.ts",
  });
  assert.equal(matchesCapability(request, capability), false);
});

test("denies a resource containing a null byte", () => {
  const request = makeRequest({
    resource: "/workspace/project/src/index.ts\0.png",
  });
  assert.equal(matchesCapability(request, capability), false);
});

test("allows any absolute path when scope is the filesystem root", () => {
  const rootCapability: Capability = {
    id: "cap-root-read",
    agentId: "agent-demo",
    action: "filesystem.read",
    scope: "/**",
  };

  const request = makeRequest({ resource: "/etc/hosts" });
  assert.equal(matchesCapability(request, rootCapability), true);
});
