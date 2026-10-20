import { readFile } from "node:fs/promises";
import type { Action, Capability } from "@nimoguard/core";

export interface NimoGuardProxyConfig {
  agentId: string;
  upstreamServerName: string;
  upstreamCommand: string;
  upstreamArgs: string[];
  capabilities: Capability[];
}

const VALID_ACTIONS: Action[] = [
  "filesystem.read",
  "filesystem.write",
  "command.execute",
  "network.request",
  "tool.call",
];

export class ConfigError extends Error {
  constructor(message: string) {
    super(`Invalid NimoGuard config: ${message}`);
    this.name = "ConfigError";
  }
}

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function assertCapability(c: unknown, index: number): asserts c is Capability {
  if (typeof c !== "object" || c === null) {
    throw new ConfigError(`capabilities[${index}] must be an object`);
  }
  const cap = c as Record<string, unknown>;

  if (!isString(cap["id"])) {
    throw new ConfigError(`capabilities[${index}].id must be a non-empty string`);
  }
  if (!isString(cap["agentId"])) {
    throw new ConfigError(`capabilities[${index}].agentId must be a non-empty string`);
  }
  if (!isString(cap["action"]) || !VALID_ACTIONS.includes(cap["action"] as Action)) {
    throw new ConfigError(
      `capabilities[${index}].action must be one of: ${VALID_ACTIONS.join(", ")}`,
    );
  }
  if (!isString(cap["scope"])) {
    throw new ConfigError(`capabilities[${index}].scope must be a non-empty string`);
  }
  if (cap["expiresAt"] !== undefined && !isString(cap["expiresAt"])) {
    throw new ConfigError(`capabilities[${index}].expiresAt must be a string if present`);
  }
  if (
    cap["constraints"] !== undefined &&
    (typeof cap["constraints"] !== "object" || cap["constraints"] === null)
  ) {
    throw new ConfigError(`capabilities[${index}].constraints must be an object if present`);
  }
}

function parseConfig(data: unknown): NimoGuardProxyConfig {
  if (typeof data !== "object" || data === null) {
    throw new ConfigError("root must be a JSON object");
  }
  const obj = data as Record<string, unknown>;

  if (!isString(obj["agentId"])) {
    throw new ConfigError("agentId must be a non-empty string");
  }
  if (!isString(obj["upstreamServerName"])) {
    throw new ConfigError("upstreamServerName must be a non-empty string");
  }
  if (!isString(obj["upstreamCommand"])) {
    throw new ConfigError("upstreamCommand must be a non-empty string");
  }
  if (!Array.isArray(obj["upstreamArgs"]) || !obj["upstreamArgs"].every(isString)) {
    throw new ConfigError("upstreamArgs must be an array of strings");
  }
  if (!Array.isArray(obj["capabilities"])) {
    throw new ConfigError("capabilities must be an array");
  }

  obj["capabilities"].forEach((c, i) => assertCapability(c, i));

  return {
    agentId: obj["agentId"],
    upstreamServerName: obj["upstreamServerName"],
    upstreamCommand: obj["upstreamCommand"],
    upstreamArgs: obj["upstreamArgs"] as string[],
    capabilities: obj["capabilities"] as Capability[],
  };
}

export async function loadConfig(configPath: string): Promise<NimoGuardProxyConfig> {
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (err) {
    throw new ConfigError(`could not read file "${configPath}": ${(err as Error).message}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`"${configPath}" is not valid JSON: ${(err as Error).message}`);
  }

  return parseConfig(data);
}
