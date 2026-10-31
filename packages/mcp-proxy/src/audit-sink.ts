import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import { JsonlFileAuditSink } from "@nimoguard/audit";
import type { AuditRecord, AuditSink } from "@nimoguard/audit";
import { ConfigError } from "./config.js";
import type { AuditLogConfig } from "./config.js";

// Wraps a sink so tool arguments never reach it. The record passed in is not
// mutated: the same request object is still used by the approval handler,
// which needs the arguments so a reviewer can see what is being approved.
export function withoutArguments(inner: AuditSink): AuditSink {
  return {
    async write(record: AuditRecord): Promise<void> {
      const metadata = record.request.context?.metadata;

      if (metadata === undefined || !("arguments" in metadata)) {
        return inner.write(record);
      }

      const remaining = { ...metadata };
      delete remaining["arguments"];

      return inner.write({
        ...record,
        request: {
          ...record.request,
          context: { ...record.request.context, metadata: remaining },
        },
      });
    },
  };
}

// Returns undefined when no auditLog is configured. Otherwise verifies the
// file can really be written before anything else starts, creating it with
// owner-only permissions because audit logs are sensitive.
export async function buildAuditSink(
  auditLog: AuditLogConfig | undefined,
): Promise<AuditSink | undefined> {
  if (auditLog === undefined) {
    return undefined;
  }

  try {
    await mkdir(path.dirname(auditLog.path), { recursive: true, mode: 0o700 });
    const handle = await open(auditLog.path, "a", 0o600);
    await handle.close();
  } catch (err) {
    throw new ConfigError(
      `auditLog.path "${auditLog.path}" is not writable: ${(err as Error).message}`,
    );
  }

  const fileSink = new JsonlFileAuditSink(auditLog.path);

  return auditLog.includeArguments === true ? fileSink : withoutArguments(fileSink);
}
