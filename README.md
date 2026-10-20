# NimoGuard

![CI](https://github.com/nimaohamdi/NimoGuard/actions/workflows/ci.yml/badge.svg)

A **capability-based, default-deny authorization firewall for MCP servers and AI agents** — with both a policy engine and real strict enforcement, not just advice.

NimoGuard sits between an AI agent and the actions it can take on its own. It works two ways:

1. **As an MCP proxy** — it sits in front of a real MCP server; every `tools/call` is checked before it reaches the upstream (next layer) server.
2. **As a guarded execution layer** — `guardedReadFile`, `guardedWriteFile`, `guardedFetch`, and `guardedExec` only perform the real file read, file write, network request, or shell command **if the policy allows it**. Otherwise nothing happens — no file is touched or changed, no process is spawned.

Anything not explicitly granted is denied. Every decision can be audited.

## Why

AI agents act on your machine and network. Prompts are not a security
boundary — an agent that can call a tool will eventually be tricked into
calling it the wrong way. NimoGuard puts an explicit, testable policy layer
in front of the action itself, and it **fails closed**: invalid input, bad
dates, and logging failures all result in `DENY`.

## Architecture

    Agent → NimoGuard (proxy or guarded functions) → real action (file, network, process, MCP server)

| Package | Role |
|---|---|
| `@nimoguard/core` | Shared types: Action, Decision, Capability, AuthorizationRequest |
| `@nimoguard/capabilities` | Matcher: does a request fall inside a capability's scope? |
| `@nimoguard/policy` | `authorize(request, capabilities, now?)`, a pure function |
| `@nimoguard/audit` | `authorizeAndAudit` plus pluggable sinks (in-memory, JSONL file) |
| `@nimoguard/mcp-proxy` | An MCP server that authorizes and forwards `tools/call` to an upstream MCP server |
| `@nimoguard/enforce` | `guardedReadFile` / `guardedWriteFile` / `guardedFetch` / `guardedExec` — real enforcement, not just a decision |

Design decisions:

- **Pure core.** `authorize` has no side effects. Logging lives in a separate layer.
- **Injected clock.** The current time is a parameter, so tests never depend on the real clock.
- **Fail closed everywhere.** If the audit sink throws, even an `ALLOW` becomes `DENY`.
- **No shell in `guardedExec`.** Commands run through `execFile`, never a shell,
  so even if a metacharacter ever slipped past the matcher, there's no shell
  there to interpret it.
- **Deny before contact.** An unrecognized or ungranted tool/file/command is
  rejected before anything real happens — upstream servers, the filesystem,
  and child processes are never touched for a denied request.

## Try the demos

![NimoGuard enforce demo](docs/enforce-demo.gif)

    pnpm install
    pnpm demo                                 # audit-layer demo (ALLOW/DENY/REQUIRE_APPROVAL)
    pnpm --filter @nimoguard/mcp-proxy demo    # a real MCP proxy blocking/forwarding tool calls
    pnpm --filter @nimoguard/enforce demo      # real disk writes and a real child process, gated live

The enforce demo (shown above) actually writes a file to a temp sandbox,
reads it back, runs a real `echo` subprocess — and then shows three attempts
(writing outside the sandbox, running `rm`, chaining a command with `;`)
being blocked before anything happens.

## Using the MCP proxy with a real client (e.g. Claude Desktop)

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

## Quick example (guarded execution)

    import { guardedReadFile, AuthorizationError } from "@nimoguard/enforce";

    const capabilities = [
      {
        id: "cap-1",
        agentId: "agent-1",
        action: "filesystem.read",
        scope: "/workspace/project/**",
      },
    ];

    try {
      const content = await guardedReadFile(
        "agent-1",
        "/workspace/project/../.ssh/id_rsa",
        capabilities,
      );
    } catch (err) {
      if (err instanceof AuthorizationError) {
        console.log(err.decision, err.reason);
        // "DENY" "No matching capability" — and the file was never opened.
      }
    }

## What is enforced today

- **Filesystem scopes:** paths are normalized (`path.posix.normalize`), so
  traversal like `/workspace/project/../.ssh/id_rsa` is rejected. Relative
  paths and null bytes are rejected. `/workspace/project2` does not match
  `/workspace/project/**`.
- **Network scopes:** the resource is parsed with `new URL()`. Only `https:`
  is allowed, URLs with userinfo are rejected, and the hostname must match the
  scope exactly, so `api.github.com.evil.com` and
  `https://api.github.com@evil.com/` are denied.
- **Command scopes:** only the first token of the command is matched against
  the scope, and any shell metacharacter (`; & | \` $ ( ) < > newline`)
  anywhere in the command denies it outright — `git status; rm -rf /` is
  rejected even though it starts with an allowed binary.
- **MCP tool scopes:** a scope like `mcp://github/create_issue` grants one
  tool on one server; `mcp://github/*` grants every tool on that server.
- **Expiry:** expired, exactly-expiring, and unparseable `expiresAt` are all denied.
- **Human-in-the-loop:** a capability with `constraints.requireApproval: true`
  returns `REQUIRE_APPROVAL` instead of `ALLOW`.
- **Real enforcement, not just a decision:** the MCP proxy and the
  `@nimoguard/enforce` functions actually gate the real action — a blocked
  file write never touches disk, a blocked command never spawns a process, a
  blocked tool call never reaches the upstream MCP server.

## Status

| Area | State |
|---|---|
| Filesystem matcher | Done |
| Network matcher (exact https host) | Done |
| Command matcher (first token + shell metacharacter guard) | Done |
| MCP tool matcher (exact + server wildcard) | Done |
| Expiring capabilities | Done |
| Audit logging (fail-closed) | Done |
| `REQUIRE_APPROVAL` via `constraints.requireApproval` | Done |
| MCP proxy (stdio, forwards `tools/list` and `tools/call`) | Done |
| Guarded fs/network/exec enforcement (`@nimoguard/enforce`) | Done |
| `RiskLevel` (automatic risk scoring) | Not implemented |
| Config-file-driven proxy/agent setup | Not implemented (code-configured only) |

66 unit and integration tests, all passing in CI.

## Threat model

NimoGuard assumes the agent is **untrusted** and the policy author is trusted.

Mitigated:

- Path traversal (`..`), relative paths, null bytes
- Prefix-lookalike paths (`/workspace/project2`)
- Lookalike hosts and userinfo tricks in URLs
- Command chaining, piping, substitution, redirection, and backgrounding
- Lookalike MCP server names, and cross-server leakage via wildcard scopes
- Expired or malformed capabilities
- Silent audit failure (logging errors deny the request)
- Tool-name enumeration: an unrecognized tool is denied before the upstream
  server is ever contacted
- Shell injection in `guardedExec`: commands run via `execFile`, never a shell

## Known limitations

- **Symlink escape:** path checks are string-based. A symlink inside an
  allowed directory can point outside it. The guarded functions do not
  resolve paths with `fs.realpath` yet.
- **TOCTOU:** the file system can change between the authorization check and
  the actual use.
- **No wildcards for network hosts:** network scopes are exact hostnames only.
- **Library-level enforcement, not a sandbox:** the MCP proxy and guarded
  functions enforce policy for any code that calls through them. They cannot
  stop code that bypasses them entirely and calls `fs`, `fetch`, or
  `child_process` directly — that would require an OS-level sandbox (seccomp,
  containers, etc.), which is out of scope for this project.
- **`REQUIRE_APPROVAL` has no interactive approval flow yet:** it currently
  just blocks with a clear message; there is no UI or channel for a human to
  approve it in-flow.

## Development

    pnpm install
    pnpm -r test
    pnpm demo
    pnpm --filter @nimoguard/mcp-proxy demo
    pnpm --filter @nimoguard/enforce demo

## License

MIT
