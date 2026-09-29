import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createUpstreamServer } from "./upstream-server.js";

async function connectedClient() {
  const server = createUpstreamServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.1.0" });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return client;
}

test("lists the three demo tools", async () => {
  const client = await connectedClient();
  const result = await client.listTools();
  const names = result.tools.map((t) => t.name).sort();

  assert.deepEqual(names, ["echo", "list_files", "read_file"]);
});

test("echo returns the given text", async () => {
  const client = await connectedClient();
  const result = await client.callTool({ name: "echo", arguments: { text: "hi" } });

  assert.equal(result.isError, undefined);
  const content = result.content as Array<{ type: string; text: string }>;
  assert.equal(content[0]?.text, "hi");
});

test("read_file reads the sandbox notes file", async () => {
  const client = await connectedClient();
  const result = await client.callTool({ name: "read_file", arguments: { name: "notes.txt" } });

  const content = result.content as Array<{ type: string; text: string }>;
  assert.match(content[0]?.text ?? "", /hello from the sandbox/);
});
