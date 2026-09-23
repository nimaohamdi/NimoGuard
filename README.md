# NimoGuard

A capability-based, **default-deny** authorization gateway for AI agents.

Before an agent reads a file, calls an API, or runs a tool, it asks NimoGuard.
Anything not explicitly granted is denied. Every decision can be audited.

## Why

AI agents act on your machine and network. Prompts are not a security
boundary. NimoGuard puts an explicit, testable policy layer between the agent
and the action, and it **fails closed**: invalid input, bad dates, and logging
failures all result in `DENY`.

## Quick example

    import { authorizeAndAudit, InMemoryAuditSink } from "@nimoguard/audit";

    const capabilities = [
      {
        id: "cap-1",
        agentId: "agent-1",
        action: "filesystem.read",
        scope: "/workspace/project/**",
        expiresAt: "2026-12-31T00:00:00Z",
      },
      {
        id: "cap-2",
        agentId: "agent-1",
        action: "network.request",
        scope: "api.github.com",
      },
    ];

    const sink = new InMemoryAuditSink();

    const decision = await authorizeAndAudit(
      {
        agentId: "agent-1",
        sessionId: "session-1",
        action: "filesystem.read",
        resource: "/workspace/project/../.ssh/id_rsa",
      },
      capabilities,
      sink,
    );

    // { decision: "DENY", reason: "No matching capability", requestId: "..." }

## Architecture

| Package | Role |
|---|---|
| `@nimoguard/core` | Shared types: Action, Decision, Capability, AuthorizationRequest |
| `@nimoguard/capabilities` | Matcher: does a request fall inside a capability's scope? |
| `@nimoguard/policy` | `authorize(request, capabilities, now?)`, a pure function |
| `@nimoguard/audit` | `authorizeAndAudit` plus pluggable sinks (in-memory, JSONL file) |

Design decisions:

- **Pure core.** `authorize` has no side effects. Logging lives in a separate layer.
- **Injected clock.** The current time is a parameter, so tests never depend on the real clock.
- **Fail closed everywhere.** If the audit sink throws, even an `ALLOW` becomes `DENY`.

## What is enforced today

- **Filesystem scopes:** paths are normalized (`path.posix.normalize`), so
  traversal like `/workspace/project/../.ssh/id_rsa` is rejected. Relative
  paths and null bytes are rejected. `/workspace/project2` does not match
  `/workspace/project/**`.
- **Network scopes:** the resource is parsed with `new URL()`. Only `https:`
  is allowed, URLs with userinfo are rejected, and the hostname must match the
  scope exactly, so `api.github.com.evil.com` and
  `https://api.github.com@evil.com/` are denied.
- **Expiry:** expired, exactly-expiring, and unparseable `expiresAt` are all denied.
## Status

| Area | State |
|---|---|
| Filesystem matcher | Done |
| Network matcher (exact https host) | Done |
| Expiring capabilities | Done |
| Audit logging (fail-closed) | Done |
| `REQUIRE_APPROVAL` / `RiskLevel` | Types defined, not used yet |
| `constraints` on capabilities | Ignored for now |
| `command.execute`, `tool.call` matchers | Not implemented (default-deny) |

## Threat model

NimoGuard assumes the agent is **untrusted** and the policy author is trusted.

Mitigated:

- Path traversal (`..`), relative paths, null bytes
- Prefix-lookalike paths (`/workspace/project2`)
- Lookalike hosts and userinfo tricks in URLs
- Expired or malformed capabilities
- Silent audit failure (logging errors deny the request)

## Known limitations

- **Symlink escape:** path checks are string-based. A symlink inside an
  allowed directory can point outside it. The execution layer must resolve
  paths with `fs.realpath` before acting.
- **TOCTOU:** the file system can change between the authorization check and
  the actual use. NimoGuard does not enforce the action itself.
- **No wildcards for hosts:** network scopes are exact hostnames only.
- **Advisory layer:** NimoGuard returns decisions; it does not sandbox the agent.
  An agent that can bypass the gateway is not constrained by it.

## Development

    pnpm install
    pnpm -r test

## License

MIT