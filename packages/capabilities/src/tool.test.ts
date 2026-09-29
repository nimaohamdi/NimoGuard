import { test } from "node:test";
import assert from "node:assert/strict";
import type { AuthorizationRequest, Capability } from "@nimoguard/core";
import { matchesCapability } from "./matcher.js";

function req(resource: string): AuthorizationRequest {
  return {
    agentId: "agent-1",
    sessionId: "s-1",
    action: "tool.call",
    resource,
  };
}

function cap(scope: string): Capability {
  return {
    id: "cap-tool",
    agentId: "agent-1",
    action: "tool.call",
    scope,
  };
}

test("allows an exact server/tool match", () => {
  assert.equal(
    matchesCapability(req("mcp://github/create_issue"), cap("mcp://github/create_issue")),
    true,
  );
});

test("denies a different tool on the same server", () => {
  assert.equal(
    matchesCapability(req("mcp://github/delete_repo"), cap("mcp://github/create_issue")),
    false,
  );
});

test("allows any tool on the server with a wildcard scope", () => {
  assert.equal(
    matchesCapability(req("mcp://github/create_issue"), cap("mcp://github/*")),
    true,
  );
  assert.equal(
    matchesCapability(req("mcp://github/delete_repo"), cap("mcp://github/*")),
    true,
  );
});

test("denies a different server even with a wildcard scope", () => {
  assert.equal(
    matchesCapability(req("mcp://gitlab/create_issue"), cap("mcp://github/*")),
    false,
  );
});

test("denies a lookalike server name", () => {
  assert.equal(
    matchesCapability(req("mcp://github-evil/create_issue"), cap("mcp://github/*")),
    false,
  );
});

test("denies a non-mcp protocol", () => {
  assert.equal(
    matchesCapability(req("https://github/create_issue"), cap("mcp://github/*")),
    false,
  );
});

test("denies an invalid resource", () => {
  assert.equal(
    matchesCapability(req("not a url"), cap("mcp://github/*")),
    false,
  );
});

test("denies a nested tool path", () => {
  assert.equal(
    matchesCapability(req("mcp://github/repo/create_issue"), cap("mcp://github/*")),
    false,
  );
});

test("denies a filesystem-style path for a tool capability", () => {
  assert.equal(matchesCapability(req("/etc/passwd"), cap("mcp://github/*")), false);
});
