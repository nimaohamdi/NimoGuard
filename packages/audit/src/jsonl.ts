import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { AuditRecord, AuditSink } from "./sink.js";

export class JsonlFileAuditSink implements AuditSink {
  constructor(private readonly filePath: string) {}

  async write(record: AuditRecord): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, JSON.stringify(record) + "\n", "utf8");
  }
}
