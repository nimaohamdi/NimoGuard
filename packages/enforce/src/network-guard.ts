import type { Capability } from "@nimoguard/core";
import { authorizeAndAudit } from "@nimoguard/audit";
import type { AuditSink } from "@nimoguard/audit";
import { InMemoryAuditSink } from "@nimoguard/audit";
import { AuthorizationError } from "./fs-guard.js";

const defaultSink = new InMemoryAuditSink();

export async function guardedFetch(
  agentId: string,
  url: string,
  capabilities: Capability[],
  init?: RequestInit,
  sink: AuditSink = defaultSink,
): Promise<Response> {
  const result = await authorizeAndAudit(
    {
      agentId,
      sessionId: `enforce-${agentId}`,
      action: "network.request",
      resource: url,
    },
    capabilities,
    sink,
  );

  if (result.decision !== "ALLOW") {
    throw new AuthorizationError(result.decision, result.reason);
  }

  return fetch(url, init);
}
