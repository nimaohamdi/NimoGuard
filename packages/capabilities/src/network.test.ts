import { test } from "node:test";
import assert from "node:assert/strict";
import type { AuthorizationRequest, Capability } from "@nimoguard/core";
import { matchesCapability } from "./matcher.js";

const capability: Capability = {
  id: "cap-net",
  agentId: "agent-1",
  action: "network.request",
  scope: "api.github.com",
};

function req(resource: string): AuthorizationRequest {
  return {
    agentId: "agent-1",
    sessionId: "s-1",
    action: "network.request",
    resource,
  };
}

test("allows an https URL on the exact host", () => {
  assert.equal(matchesCapability(req("https://api.github.com/repos/x/y"), capability), true);
});

test("denies a lookalike host with the scope as a prefix", () => {
  assert.equal(matchesCapability(req("https://api.github.com.evil.com/"), capability), false);
});

test("denies a URL with userinfo (@ trick)", () => {
  assert.equal(matchesCapability(req("https://api.github.com@evil.com/"), capability), false);
  assert.equal(matchesCapability(req("https://evil.com@api.github.com/"), capability), false);
});

test("denies a non-https protocol", () => {
  assert.equal(matchesCapability(req("http://api.github.com/"), capability), false);
});

test("denies an invalid URL", () => {
  assert.equal(matchesCapability(req("not a url"), capability), false);
});

test("denies a different host", () => {
  assert.equal(matchesCapability(req("https://github.com/"), capability), false);
});

test("denies a filesystem-style path for a network capability", () => {
  assert.equal(matchesCapability(req("/etc/passwd"), capability), false);
});
