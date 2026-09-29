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
    case "tool.call":
      return matchesToolScope(request.resource, capability.scope);
    default:
      // command.execute: no matcher yet (default-deny)
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

interface McpRef {
  server: string;
  tool: string;
}

function parseMcpResource(resource: string): McpRef | null {
  let url: URL;
  try {
    url = new URL(resource);
  } catch {
    return null;
  }

  if (url.protocol !== "mcp:") {
    return null;
  }

  if (url.username !== "" || url.password !== "") {
    return null;
  }

  const server = url.hostname;
  // pathname includes the leading "/", e.g. "/create_issue"
  const toolPath = url.pathname.replace(/^\//, "");

  if (server === "" || toolPath === "" || toolPath.includes("/")) {
    return null;
  }

  return { server, tool: toolPath };
}

function matchesToolScope(resource: string, scope: string): boolean {
  const resourceRef = parseMcpResource(resource);
  const scopeRef = parseMcpResource(scope);

  if (!resourceRef || !scopeRef) {
    return false;
  }

  if (resourceRef.server !== scopeRef.server) {
    return false;
  }

  if (scopeRef.tool === "*") {
    return true;
  }

  return resourceRef.tool === scopeRef.tool;
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
