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

  switch (request.action) {
    case "filesystem.read":
    case "filesystem.write":
      return matchesPathScope(request.resource, capability.scope);
    case "network.request":
      return matchesNetworkScope(request.resource, capability.scope);
    default:
      // command.execute, tool.call: no matcher yet (default-deny)
      return false;
  }
}

function matchesNetworkScope(resource: string, scope: string): boolean {
  let url: URL;
  try {
    url = new URL(resource);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  // Reject userinfo tricks like https://api.github.com@evil.com/
  if (url.username !== "" || url.password !== "") {
    return false;
  }

  // Scope is an exact hostname (no wildcards, no scheme, no path).
  return url.hostname === scope.toLowerCase();
}

function matchesPathScope(resource: string, scope: string): boolean {
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