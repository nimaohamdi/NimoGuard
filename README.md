# NimoGuard

![CI](https://github.com/nimaohamdi/NimoGuard/actions/workflows/ci.yml/badge.svg)

A **capability-based, default-deny authorization firewall for MCP servers** — and for any AI agent that reads files, calls APIs, or runs tools.

NimoGuard sits between an AI agent and the tools it can use. It sits in front of a Model Context Protocol (MCP) server as a proxy: every `tools/call` is checked against an explicit policy before it reaches the real server. Anything not explicitly granted is denied. Every decision can be audited.

## Why

AI agents act on your machine and network. Prompts are not a security
boundary — an agent that can call a tool will eventually be tricked into
calling it the wrong way. NimoGuard puts an explicit, testable policy layer
in front of that tool call, and it **fails closed**: invalid input, bad
dates, and logging failures all result in `DENY`.

## Architecture

    Agent (Claude, etc.) → NimoGuard proxy → real MCP server

The proxy speaks MCP on both sides. To the agent, it looks like a normal MCP
server. Internally, it forwards every request to the real (upstream) server —
but only after `authorize()` has checked it against the agent's granted
capabilities.

| Package | Role |
|---|---|
| `@nimoguard/core` | Shared types: Action, Decision, Capability, AuthorizationRequest |
| `@nimoguard/capabilities` | Matcher: does a request fall inside a capability's scope? |
| `@nimoguard/policy` | `authorize(request, capabilities, now?)`, a pure function |
| `@nimoguard/audit` | `authorizeAndAudit` plus pluggable sinks (in-memory, JSONL file) |
| `@nimoguard/mcp-proxy` | An MCP server that authorizes and forwards `tools/call` to an upstream MCP server |

Design decisions:

- **Pure core.** `authorize` has no side effects. Logging lives in a separate layer.
- **Injected clock.** The current time is a parameter, so tests never depend on the real clock.
- **Fail closed everywhere.** If the audit sink throws, even an `ALLOW` becomes `DENY`.
- **Deny before contact.** An unrecognized or ungranted tool name is rejected
  before the proxy ever talks to the upstream server, so upstream never even
  learns what was attempted.

## Try the MCP proxy demo

    pnpm install
    pnpm --filter @nimoguard/mcp-proxy demo

This spins up a small demo upstream MCP server (three tools: `echo`,
`list_files`, `read_file`) behind the NimoGuard proxy, then makes four calls
as an agent would:

- `echo` — granted outright → forwarded, `ALLOW`
- `list_files` — granted but requires human approval → blocked, `REQUIRE_APPROVAL`
- `read_file` — never granted → blocked, `DENY`
- an unknown tool name → blocked, `DENY`, without ever reaching upstream

## Using it with a real MCP client (e.g. Claude Desktop)

Point your MCP client at the proxy instead of the real server. In
`claude_desktop_config.json`:

    {
      "mcpServers": {
        "my-tool-via-nimoguard": {
          "command": "node",
          "args": ["/path/to/nimoguard/packages/mcp-proxy/dist/proxy-server.js"]
        }
      }
    }

The proxy's capabilities and upstream command are currently configured in
code (`createProxy(options)` in `proxy-server.ts`); a config-file-driven setup
is on the roadmap.

## Quick example (library usage)

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
        action: "tool.call",
        scope: "mcp://github/*",
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

## What is enforced today

- **Filesystem scopes:** paths are normalized (`path.posix.normalize`), so
  traversal like `/workspace/project/../.ssh/id_rsa` is rejected. Relative
  paths and null bytes are rejected. `/workspace/project2` does not match
  `/workspace/project/**`.
- **Network scopes:** the resource is parsed with `new URL()`. Only `https:`
  is allowed, URLs with userinfo are rejected, and the hostname must match the
  scope exactly, so `api.github.com.evil.com` and
  `https://api.github.com@evil.com/` are denied.
- **MCP tool scopes:** a scope like `mcp://github/create_issue` grants one
  tool on one server; `mcp://github/*` grants every tool on that server. A
  different server is never matched by a wildcard scope for another server.
- **Expiry:** expired, exactly-expiring, and unparseable `expiresAt` are all denied.
- **Human-in-the-loop:** a capability with `constraints.requireApproval: true`
  returns `REQUIRE_APPROVAL` instead of `ALLOW` for the matching request. If
  another matching capability grants plain access, that one wins.
- **The MCP proxy enforces all of the above at the transport level:** a
  blocked `tools/call` never reaches the upstream server.

## Status

| Area | State |
|---|---|
| Filesystem matcher | Done |
| Network matcher (exact https host) | Done |
| MCP tool matcher (exact + server wildcard) | Done |
| Expiring capabilities | Done |
| Audit logging (fail-closed) | Done |
| `REQUIRE_APPROVAL` via `constraints.requireApproval` | Done |
| MCP proxy (stdio, forwards `tools/list` and `tools/call`) | Done |
| `RiskLevel` (automatic risk scoring) | Not implemented |
| `command.execute` matcher | Not implemented (default-deny) |
| Config-file-driven proxy setup | Not implemented (code-configured only) |

47 unit and integration tests, all passing in CI.

## Threat model

NimoGuard assumes the agent is **untrusted** and the policy author is trusted.

Mitigated:

- Path traversal (`..`), relative paths, null bytes
- Prefix-lookalike paths (`/workspace/project2`)
- Lookalike hosts and userinfo tricks in URLs
- Lookalike MCP server names, and cross-server leakage via wildcard scopes
- Expired or malformed capabilities
- Silent audit failure (logging errors deny the request)
- Tool-name enumeration: an unrecognized tool is denied before the upstream
  server is ever contacted

## Known limitations

- **Symlink escape:** path checks are string-based. A symlink inside an
  allowed directory can point outside it. The execution layer must resolve
  paths with `fs.realpath` before acting.
- **TOCTOU:** the file system can change between the authorization check and
  the actual use. NimoGuard does not enforce the action itself.
- **No wildcards for network hosts:** network scopes are exact hostnames only.
- **No matcher yet for `command.execute`:** requests for this action are
  always denied, not evaluated against a real policy.
- **`REQUIRE_APPROVAL` has no interactive approval flow yet:** the proxy
  currently just blocks it with a clear message; there is no UI or channel
  for a human to approve it in-flow.
- **Advisory layer:** NimoGuard returns decisions; it does not sandbox the agent.
  An agent that can bypass the gateway is not constrained by it.

## Development

    pnpm install
    pnpm -r test
    pnpm demo                                     # audit-layer demo
    pnpm --filter @nimoguard/mcp-proxy demo        # MCP proxy demo

## License

MIT