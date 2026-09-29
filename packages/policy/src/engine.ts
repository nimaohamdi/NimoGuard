import type {
  AuthorizationDecision,
  AuthorizationRequest,
  Capability,
} from "@nimoguard/core";

import { matchesCapability } from "@nimoguard/capabilities";

function isExpired(capability: Capability, now: Date): boolean {
  if (capability.expiresAt === undefined) {
    return false;
  }

  const expiresAtMs = Date.parse(capability.expiresAt);

  // Unparseable expiry is treated as expired (fail-closed).
  if (Number.isNaN(expiresAtMs)) {
    return true;
  }

  return expiresAtMs <= now.getTime();
}

function requiresApproval(capability: Capability): boolean {
  return capability.constraints?.["requireApproval"] === true;
}

export function authorize(
  request: AuthorizationRequest,
  capabilities: Capability[],
  now: Date = new Date(),
): AuthorizationDecision {
  const matching = capabilities.filter((capability) =>
    matchesCapability(request, capability),
  );

  if (matching.length === 0) {
    return {
      decision: "DENY",
      reason: "No matching capability",
    };
  }

  const valid = matching.filter((capability) => !isExpired(capability, now));

  if (valid.length === 0) {
    return {
      decision: "DENY",
      reason: "Matching capability expired or invalid",
    };
  }

  // If any valid matching capability grants plain ALLOW, that wins: the
  // policy author explicitly allowed this without approval.
  const plainAllow = valid.find((capability) => !requiresApproval(capability));

  if (plainAllow) {
    return {
      decision: "ALLOW",
      reason: "Matching capability found",
      capabilityId: plainAllow.id,
    };
  }

  const needsApproval = valid[0]!;

  return {
    decision: "REQUIRE_APPROVAL",
    reason: "Matching capability requires approval",
    capabilityId: needsApproval.id,
  };
}