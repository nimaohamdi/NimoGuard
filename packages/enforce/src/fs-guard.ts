import { readFile, writeFile } from "node:fs/promises";
import type { Capability } from "@nimoguard/core";
import { authorizeAndAudit } from "@nimoguard/audit";
import type { AuditSink } from "@nimoguard/audit";
import { InMemoryAuditSink } from "@nimoguard/audit";
import { resolveRealTarget } from "./path-resolve.js";

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

async function checkNoSymlinkEscape(
  agentId: string,
  declaredPath: string,
  action: "filesystem.read" | "filesystem.write",
  capabilities: Capability[],
  sink: AuditSink,
): Promise<void> {
  const realTarget = await resolveRealTarget(declaredPath);

  if (realTarget === declaredPath) {
    return;
  }

  const secondCheck = await authorizeAndAudit(
    {
      agentId,
      sessionId: `enforce-${agentId}`,
      action,
      resource: realTarget,
    },
    capabilities,
    sink,
  );

  if (secondCheck.decision !== "ALLOW") {
    throw new AuthorizationError(
      secondCheck.decision,
      `Resolved real path escapes the granted scope (symlink?): ${secondCheck.reason}`,
    );
  }
}

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

  await checkNoSymlinkEscape(agentId, path, "filesystem.read", capabilities, sink);

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

  await checkNoSymlinkEscape(agentId, path, "filesystem.write", capabilities, sink);

  await writeFile(path, content, "utf8");
}