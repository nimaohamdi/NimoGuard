import { randomUUID } from "node:crypto";
import type {
  AuthorizationDecision,
  AuthorizationRequest,
  Capability,
} from "@nimoguard/core";
import { authorize } from "@nimoguard/policy";
import type { AuditSink } from "./sink.js";

export async function authorizeAndAudit(
  request: AuthorizationRequest,
  capabilities: Capability[],
  sink: AuditSink,
  now: Date = new Date(),
): Promise<AuthorizationDecision> {
  const requestId = randomUUID();

  let decision: AuthorizationDecision;
  try {
    decision = { ...authorize(request, capabilities, now), requestId };
  } catch {
    decision = {
      decision: "DENY",
      reason: "Authorization error (fail-closed)",
      requestId,
    };
  }

  try {
    await sink.write({
      requestId,
      timestamp: now.toISOString(),
      request,
      decision,
    });
  } catch {
    return {
      decision: "DENY",
      reason: "Audit logging failed (fail-closed)",
      requestId,
    };
  }

  return decision;
}
