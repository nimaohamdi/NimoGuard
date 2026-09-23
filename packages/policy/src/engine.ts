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

  const valid = matching.find((capability) => !isExpired(capability, now));

  if (!valid) {
    return {
      decision: "DENY",
      reason: "Matching capability expired or invalid",
    };
  }

  return {
    decision: "ALLOW",
    reason: "Matching capability found",
    capabilityId: valid.id,
  };
}
