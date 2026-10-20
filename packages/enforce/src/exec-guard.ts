import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Capability } from "@nimoguard/core";
import { authorizeAndAudit } from "@nimoguard/audit";
import type { AuditSink } from "@nimoguard/audit";
import { InMemoryAuditSink } from "@nimoguard/audit";
import { AuthorizationError } from "./fs-guard.js";

const execFileAsync = promisify(execFile);
const defaultSink = new InMemoryAuditSink();

export interface GuardedExecResult {
  stdout: string;
  stderr: string;
}

export async function guardedExec(
  agentId: string,
  command: string,
  capabilities: Capability[],
  sink: AuditSink = defaultSink,
): Promise<GuardedExecResult> {
  const result = await authorizeAndAudit(
    {
      agentId,
      sessionId: `enforce-${agentId}`,
      action: "command.execute",
      resource: command,
    },
    capabilities,
    sink,
  );

  if (result.decision !== "ALLOW") {
    throw new AuthorizationError(result.decision, result.reason);
  }

  // Deliberately NOT using a shell (execFile, not exec): the matcher already
  // rejects shell metacharacters, but executing through a shell would make
  // that protection meaningless if this ever changed. Splitting into tokens
  // here means there is no shell to interpret `;`, `|`, `$()`, etc. even if
  // something upstream slipped past the matcher.
  const [binary, ...args] = command.trim().split(/\s+/);

  const { stdout, stderr } = await execFileAsync(binary!, args);
  return { stdout, stderr };
}
