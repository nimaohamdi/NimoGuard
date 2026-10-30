import type { ApprovalContext, ApprovalHandler } from "./approval.js";

export interface WebhookApprovalOptions {
  url: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function createWebhookApprovalHandler(
  options: WebhookApprovalOptions,
): ApprovalHandler {
  let parsed: URL;
  try {
    parsed = new URL(options.url);
  } catch {
    throw new Error(`Invalid approval webhook URL: ${options.url}`);
  }

  const isLoopback = LOOPBACK_HOSTS.has(parsed.hostname);
  const secure =
    parsed.protocol === "https:" || (parsed.protocol === "http:" && isLoopback);

  if (!secure) {
    throw new Error(
      "Approval webhook must use https (http is only allowed for localhost)",
    );
  }

  const timeoutMs = options.timeoutMs ?? 30_000;

  return async ({ request, decision }: ApprovalContext): Promise<boolean> => {
    const response = await fetch(parsed, {
      method: "POST",
      headers: { "content-type": "application/json", ...options.headers },
      body: JSON.stringify({
        requestId: decision.requestId,
        agentId: request.agentId,
        sessionId: request.sessionId,
        action: request.action,
        resource: request.resource,
        capabilityId: decision.capabilityId,
        reason: decision.reason,
        metadata: request.context?.metadata,
      }),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Approval webhook returned HTTP ${response.status}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error("Approval webhook returned invalid JSON");
    }

    const approved = (body as { approved?: unknown } | null)?.approved;

    if (approved === true) {
      return true;
    }
    if (approved === false) {
      return false;
    }

    throw new Error('Approval webhook response must be {"approved": true|false}');
  };
}
