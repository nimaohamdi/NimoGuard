import type {
  AuthorizationDecision,
  AuthorizationRequest,
  Capability,
} from "@nimoguard/core";
import { authorizeAndAudit } from "./audit.js";
import type { AuditSink } from "./sink.js";

export interface ApprovalContext {
  request: AuthorizationRequest;
  decision: AuthorizationDecision;
}

export type ApprovalHandler = (context: ApprovalContext) => Promise<boolean>;

export interface ApprovalOptions {
  handler?: ApprovalHandler;
  timeoutMs?: number;
  now?: Date;
}

class ApprovalTimeoutError extends Error {}

async function runHandler(
  handler: ApprovalHandler,
  context: ApprovalContext,
  timeoutMs: number | undefined,
): Promise<boolean> {
  if (timeoutMs === undefined) {
    return handler(context);
  }

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApprovalTimeoutError()), timeoutMs);
  });

  try {
    return await Promise.race([handler(context), timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export async function authorizeWithApproval(
  request: AuthorizationRequest,
  capabilities: Capability[],
  sink: AuditSink,
  options: ApprovalOptions = {},
): Promise<AuthorizationDecision> {
  const initial = await authorizeAndAudit(
    request,
    capabilities,
    sink,
    options.now,
  );

  // Only REQUIRE_APPROVAL needs a human. With no handler configured it stays
  // REQUIRE_APPROVAL, and callers treat anything that is not ALLOW as blocked.
  if (initial.decision !== "REQUIRE_APPROVAL" || !options.handler) {
    return initial;
  }

  let final: AuthorizationDecision;

  try {
    const approved = await runHandler(
      options.handler,
      { request, decision: initial },
      options.timeoutMs,
    );

    final = approved
      ? {
          decision: "ALLOW",
          reason: "Approved by human reviewer",
          requestId: initial.requestId,
          ...(initial.capabilityId !== undefined
            ? { capabilityId: initial.capabilityId }
            : {}),
        }
      : {
          decision: "DENY",
          reason: "Approval rejected by human reviewer",
          requestId: initial.requestId,
        };
  } catch (err) {
    final = {
      decision: "DENY",
      reason:
        err instanceof ApprovalTimeoutError
          ? "Approval timed out (fail-closed)"
          : "Approval handler failed (fail-closed)",
      requestId: initial.requestId,
    };
  }

  try {
    await sink.write({
      requestId: initial.requestId ?? "unknown",
      timestamp: (options.now ?? new Date()).toISOString(),
      request,
      decision: final,
    });
  } catch {
    return {
      decision: "DENY",
      reason: "Audit logging failed (fail-closed)",
      requestId: initial.requestId,
    };
  }

  return final;
}
