import type { AuthorizationRequest, Capability } from "@nimoguard/core";
import { authorizeAndAudit } from "./audit.js";
import { InMemoryAuditSink } from "./sink.js";

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const now = new Date("2026-09-23T12:00:00.000Z");

const capabilities: Capability[] = [
  {
    id: "cap-fs",
    agentId: "agent-1",
    action: "filesystem.read",
    scope: "/workspace/project/**",
  },
  {
    id: "cap-net",
    agentId: "agent-1",
    action: "network.request",
    scope: "api.github.com",
  },
  {
    id: "cap-old",
    agentId: "agent-1",
    action: "filesystem.write",
    scope: "/workspace/project/**",
    expiresAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "cap-write-approval",
    agentId: "agent-1",
    action: "filesystem.write",
    scope: "/workspace/project/deploy/**",
    constraints: { requireApproval: true },
  },
];

interface Scenario {
  title: string;
  action: AuthorizationRequest["action"];
  resource: string;
}

const scenarios: Scenario[] = [
  { title: "Read a file inside the project", action: "filesystem.read", resource: "/workspace/project/src/index.ts" },
  { title: "Path traversal to SSH key", action: "filesystem.read", resource: "/workspace/project/../.ssh/id_rsa" },
  { title: "Lookalike directory (project2)", action: "filesystem.read", resource: "/workspace/project2/secrets.txt" },
  { title: "GitHub API over https", action: "network.request", resource: "https://api.github.com/repos/x/y" },
  { title: "Lookalike host (.evil.com)", action: "network.request", resource: "https://api.github.com.evil.com/" },
  { title: "Userinfo trick (@)", action: "network.request", resource: "https://api.github.com@evil.com/" },
  { title: "Write with an expired capability", action: "filesystem.write", resource: "/workspace/project/out.txt" },
  { title: "Write to deploy folder (requires human approval)", action: "filesystem.write", resource: "/workspace/project/deploy/release.sh" },
  { title: "Run a command (no matcher, default-deny)", action: "command.execute", resource: "rm -rf /" },
];

const sink = new InMemoryAuditSink();

console.log("\nNimoGuard demo\n");

for (const s of scenarios) {
  const result = await authorizeAndAudit(
    { agentId: "agent-1", sessionId: "demo", action: s.action, resource: s.resource },
    capabilities,
    sink,
    now,
  );

  const tag =
    result.decision === "ALLOW" ? green("ALLOW") :
    result.decision === "REQUIRE_APPROVAL" ? yellow("APPROVAL") :
    red("DENY ");

  console.log(`${tag}  ${s.title}`);
  console.log(dim(`       ${s.action} ${s.resource}`));
  console.log(dim(`       ${result.reason}`));
}

console.log(`\n${sink.records.length} decisions recorded in the audit sink.\n`);