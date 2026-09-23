import type {
  AuthorizationDecision,
  AuthorizationRequest,
} from "@nimoguard/core";

export interface AuditRecord {
  requestId: string;
  timestamp: string;
  request: AuthorizationRequest;
  decision: AuthorizationDecision;
}

export interface AuditSink {
  write(record: AuditRecord): Promise<void>;
}

export class InMemoryAuditSink implements AuditSink {
  readonly records: AuditRecord[] = [];

  async write(record: AuditRecord): Promise<void> {
    this.records.push(record);
  }
}

