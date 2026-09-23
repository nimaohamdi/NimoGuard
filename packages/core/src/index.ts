export type Action =
  | "filesystem.read"
  | "filesystem.write"
  | "command.execute"
  | "network.request"
  | "tool.call";

export type Decision =
  | "ALLOW"
  | "DENY"
  | "REQUIRE_APPROVAL";

export type RiskLevel =
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export interface AuthorizationRequest {
  agentId: string;
  sessionId: string;

  action: Action;
  resource: string;

  capability?: string;

  context?: {
    cwd?: string;
    environment?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface AuthorizationDecision {
  decision: Decision;

  reason: string;

  requestId?: string;

  policyId?: string;

  capabilityId?: string;

  risk?: {
    level: RiskLevel;
    score?: number;
  };
}

export interface Capability {
  id: string;

  agentId: string;

  action: Action;

  scope: string;

  constraints?: Record<string, unknown>;

  expiresAt?: string;
}
