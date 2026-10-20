import { readFile, writeFile } from "node:fs/promises";
import type { Capability } from "@nimoguard/core";
import { authorizeAndAudit } from "@nimoguard/audit";
import type { AuditSink } from "@nimoguard/audit";
import { InMemoryAuditSink } from "@nimoguard/audit";

export class AuthorizationError extends Error {
  constructor(
    public readonly decision: string,
    public readonly reason: string,
  ) {
    super(`NimoGuard blocked this action: ${decision} — ${reason}`);
    this.name = "AuthorizationError";
  }
}

const defaultSink = new InMemoryAuditSink();

export async function guardedReadFile(
  agentId: string,
  path: string,
  capabilities: Capability[],
  sink: AuditSink = defaultSink,
): Promise<string> {
  const result = await authorizeAndAudit(
    {
      agentId,
      sessionId: `enforce-${agentId}`,
      action: "filesystem.read",
      resource: path,
    },
    capabilities,
    sink,
  );

  if (result.decision !== "ALLOW") {
    throw new AuthorizationError(result.decision, result.reason);
  }

  return readFile(path, "utf8");
}

export async function guardedWriteFile(
  agentId: string,
  path: string,
  content: string,
  capabilities: Capability[],
  sink: AuditSink = defaultSink,
): Promise<void> {
  const result = await authorizeAndAudit(
    {
      agentId,
      sessionId: `enforce-${agentId}`,
      action: "filesystem.write",
      resource: path,
    },
    capabilities,
    sink,
  );

  if (result.decision !== "ALLOW") {
    throw new AuthorizationError(result.decision, result.reason);
  }

  await writeFile(path, content, "utf8");
}

