#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWebhookApprovalHandler } from "@nimoguard/audit";
import type { ApprovalHandler } from "@nimoguard/audit";
import { loadConfig, ConfigError } from "./config.js";
import type { ApprovalConfig } from "./config.js";
import { createProxy } from "./proxy-server.js";

function parseArgs(argv: string[]): { configPath: string } {
  const flagIndex = argv.indexOf("--config");
  if (flagIndex === -1 || argv[flagIndex + 1] === undefined) {
    throw new ConfigError("missing required flag: --config <path>");
  }
  return { configPath: argv[flagIndex + 1]! };
}

function buildApprovalHandler(
  approval: ApprovalConfig | undefined,
): ApprovalHandler | undefined {
  if (approval === undefined) {
    return undefined;
  }

  const headers: Record<string, string> = {};

  if (approval.authTokenEnv !== undefined) {
    const token = process.env[approval.authTokenEnv];
    if (!token) {
      throw new ConfigError(
        `environment variable ${approval.authTokenEnv} (approval.authTokenEnv) is not set`,
      );
    }
    headers["authorization"] = `Bearer ${token}`;
  }

  return createWebhookApprovalHandler({
    url: approval.webhookUrl,
    timeoutMs: approval.timeoutMs,
    headers,
  });
}

async function main() {
  const { configPath } = parseArgs(process.argv.slice(2));
  const config = await loadConfig(configPath);

  // Built before the upstream process is spawned, so a missing secret fails
  // fast instead of leaving a half-started proxy.
  const approvalHandler = buildApprovalHandler(config.approval);

  const { proxyServer } = await createProxy({
    agentId: config.agentId,
    upstreamServerName: config.upstreamServerName,
    upstreamCommand: config.upstreamCommand,
    upstreamArgs: config.upstreamArgs,
    capabilities: config.capabilities,
    approvalHandler,
    approvalTimeoutMs: config.approval?.timeoutMs ?? 30_000,
  });

  const transport = new StdioServerTransport();
  await proxyServer.connect(transport);
}

main().catch((err) => {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});