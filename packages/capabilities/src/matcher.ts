import path from "node:path";

import type {
  AuthorizationRequest,
  Capability,
} from "@nimoguard/core";

export function matchesCapability(
  request: AuthorizationRequest,
  capability: Capability,
): boolean {
  if (request.agentId !== capability.agentId) {
    return false;
  }

  if (request.action !== capability.action) {
    return false;
  }

  return matchesScope(request.resource, capability.scope);
}

function matchesScope(resource: string, scope: string): boolean {
  if (!resource.startsWith("/") || !scope.startsWith("/")) {
    return false;
  }

  if (resource.includes("\0") || scope.includes("\0")) {
    return false;
  }

  const normalizedResource = path.posix.normalize(resource);

  if (scope.endsWith("/**")) {
    // "/**" -> "/" and "/workspace/project/**" -> "/workspace/project"
    const rawPrefix = scope.slice(0, -3) || "/";
    const prefix = path.posix.normalize(rawPrefix);

    if (prefix === "/") {
      return normalizedResource.startsWith("/");
    }

    return (
      normalizedResource === prefix ||
      normalizedResource.startsWith(`${prefix}/`)
    );
  }

  return normalizedResource === path.posix.normalize(scope);
}
