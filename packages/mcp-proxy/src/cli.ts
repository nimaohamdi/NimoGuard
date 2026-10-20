#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, ConfigError } from "./config.js";
import { createProxy } from "./proxy-server.js";

function parseArgs(argv: string[]): { configPath: string } {
  const flagIndex = argv.indexOf("--config");
  if (flagIndex === -1 || argv[flagIndex + 1] === undefined) {
    throw new ConfigError('missing required flag: --config <path>');
  }
  return { configPath: argv[flagIndex + 1]! };
}

async function main() {
  const { configPath } = parseArgs(process.argv.slice(2));
  const config = await loadConfig(configPath);

  const { proxyServer } = await createProxy({
    agentId: config.agentId,
    upstreamServerName: config.upstreamServerName,
    upstreamCommand: config.upstreamCommand,
    upstreamArgs: config.upstreamArgs,
    capabilities: config.capabilities,
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
