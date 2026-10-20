import { test } from "node:test";
import assert from "node:assert/strict";
import type { AuthorizationRequest, Capability } from "@nimoguard/core";
import { matchesCapability } from "./matcher.js";

function req(resource: string): AuthorizationRequest {
  return {
    agentId: "agent-1",
    sessionId: "s-1",
    action: "command.execute",
    resource,
  };
}

function cap(scope: string): Capability {
  return {
    id: "cap-cmd",
    agentId: "agent-1",
    action: "command.execute",
    scope,
  };
}

test("allows a command whose first token matches the scope", () => {
  assert.equal(matchesCapability(req("git status"), cap("git")), true);
});

test("allows the bare executable with no arguments", () => {
  assert.equal(matchesCapability(req("git"), cap("git")), true);
});

test("denies a different executable", () => {
  assert.equal(matchesCapability(req("rm -rf /"), cap("git")), false);
});

test("denies a command chained with a semicolon, even if it starts with the allowed binary", () => {
  assert.equal(matchesCapability(req("git status; rm -rf /"), cap("git")), false);
});

test("denies piping to another command", () => {
  assert.equal(matchesCapability(req("git log | sh"), cap("git")), false);
});

test("denies command substitution", () => {
  assert.equal(matchesCapability(req("git $(whoami)"), cap("git")), false);
  assert.equal(matchesCapability(req("git `whoami`"), cap("git")), false);
});

test("denies redirection", () => {
  assert.equal(matchesCapability(req("git status > /etc/passwd"), cap("git")), false);
  assert.equal(matchesCapability(req("git status < /etc/shadow"), cap("git")), false);
});

test("denies background execution with &", () => {
  assert.equal(matchesCapability(req("git fetch &"), cap("git")), false);
});

test("denies a newline-injected second command", () => {
  assert.equal(matchesCapability(req("git status\nrm -rf /"), cap("git")), false);
});

test("denies an empty command", () => {
  assert.equal(matchesCapability(req(""), cap("git")), false);
  assert.equal(matchesCapability(req("   "), cap("git")), false);
});

test("denies a prefix lookalike binary name", () => {
  assert.equal(matchesCapability(req("gitleaks scan"), cap("git")), false);
});
