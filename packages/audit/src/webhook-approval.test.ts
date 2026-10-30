import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Capability } from "@nimoguard/core";
import { authorizeWithApproval } from "./approval.js";
import type { ApprovalContext } from "./approval.js";
import { createWebhookApprovalHandler } from "./webhook-approval.js";
import { InMemoryAuditSink } from "./sink.js";

interface Reply {
  status: number;
  body: string;
}

async function withServer(
  reply: (body: string) => Reply | null,
  fn: (url: string, bodies: string[]) => Promise<void>,
) {
  const bodies: string[] = [];
  const server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      bodies.push(data);
      const r = reply(data);
      if (r === null) {
        return; // never answer, to test timeouts
      }
      res.writeHead(r.status, { "content-type": "application/json" });
      res.end(r.body);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await fn(`http://127.0.0.1:${port}/approve`, bodies);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const context: ApprovalContext = {
  request: {
    agentId: "agent-1",
    sessionId: "s-1",
    action: "tool.call",
    resource: "mcp://github/delete_repo",
    context: { metadata: { arguments: { repo: "demo" } } },
  },
  decision: {
    decision: "REQUIRE_APPROVAL",
    reason: "Matching capability requires approval",
    requestId: "req-1",
    capabilityId: "cap-1",
  },
};

test("approves when the webhook answers approved: true", async () => {
  await withServer(
    () => ({ status: 200, body: JSON.stringify({ approved: true }) }),
    async (url) => {
      const handler = createWebhookApprovalHandler({ url });
      assert.equal(await handler(context), true);
    },
  );
});

test("rejects when the webhook answers approved: false", async () => {
  await withServer(
    () => ({ status: 200, body: JSON.stringify({ approved: false }) }),
    async (url) => {
      const handler = createWebhookApprovalHandler({ url });
      assert.equal(await handler(context), false);
    },
  );
});

test("sends the request details the reviewer needs to decide", async () => {
  await withServer(
    () => ({ status: 200, body: JSON.stringify({ approved: true }) }),
    async (url, bodies) => {
      const handler = createWebhookApprovalHandler({ url });
      await handler(context);

      const sent = JSON.parse(bodies[0] ?? "{}");
      assert.equal(sent.requestId, "req-1");
      assert.equal(sent.agentId, "agent-1");
      assert.equal(sent.action, "tool.call");
      assert.equal(sent.resource, "mcp://github/delete_repo");
      assert.equal(sent.capabilityId, "cap-1");
      assert.deepEqual(sent.metadata, { arguments: { repo: "demo" } });
    },
  );
});

test("a non-2xx response is an error, not a rejection", async () => {
  await withServer(
    () => ({ status: 500, body: "{}" }),
    async (url) => {
      const handler = createWebhookApprovalHandler({ url });
      await assert.rejects(() => handler(context), /HTTP 500/);
    },
  );
});

test("an invalid JSON body is an error", async () => {
  await withServer(
    () => ({ status: 200, body: "not json at all" }),
    async (url) => {
      const handler = createWebhookApprovalHandler({ url });
      await assert.rejects(() => handler(context), /invalid JSON/);
    },
  );
});

test('a string "true" is not accepted as approval', async () => {
  await withServer(
    () => ({ status: 200, body: JSON.stringify({ approved: "true" }) }),
    async (url) => {
      const handler = createWebhookApprovalHandler({ url });
      await assert.rejects(() => handler(context), /approved/);
    },
  );
});

test("an unreachable webhook is an error", async () => {
  const handler = createWebhookApprovalHandler({
    url: "http://127.0.0.1:1/approve",
    timeoutMs: 2000,
  });
  await assert.rejects(() => handler(context));
});

test("a webhook that never answers times out", async () => {
  await withServer(
    () => null,
    async (url) => {
      const handler = createWebhookApprovalHandler({ url, timeoutMs: 100 });
      await assert.rejects(() => handler(context));
    },
  );
});

test("refuses plain http for a non-local host", () => {
  assert.throws(
    () => createWebhookApprovalHandler({ url: "http://example.com/approve" }),
    /https/,
  );
});

test("refuses an invalid URL", () => {
  assert.throws(
    () => createWebhookApprovalHandler({ url: "not a url" }),
    /Invalid approval webhook URL/,
  );
});

const needsApproval: Capability[] = [
  {
    id: "cap-approval",
    agentId: "agent-1",
    action: "tool.call",
    scope: "mcp://github/delete_repo",
    constraints: { requireApproval: true },
  },
];

test("end to end: an approving webhook turns REQUIRE_APPROVAL into ALLOW", async () => {
  await withServer(
    () => ({ status: 200, body: JSON.stringify({ approved: true }) }),
    async (url) => {
      const sink = new InMemoryAuditSink();
      const result = await authorizeWithApproval(
        context.request,
        needsApproval,
        sink,
        { handler: createWebhookApprovalHandler({ url }) },
      );

      assert.equal(result.decision, "ALLOW");
      assert.equal(sink.records.length, 2);
    },
  );
});

test("end to end: a failing webhook fails closed to DENY", async () => {
  await withServer(
    () => ({ status: 500, body: "{}" }),
    async (url) => {
      const sink = new InMemoryAuditSink();
      const result = await authorizeWithApproval(
        context.request,
        needsApproval,
        sink,
        { handler: createWebhookApprovalHandler({ url }) },
      );

      assert.equal(result.decision, "DENY");
      assert.match(result.reason, /handler failed/);
    },
  );
});
