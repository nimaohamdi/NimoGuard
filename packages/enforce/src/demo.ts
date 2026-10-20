import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Capability } from "@nimoguard/core";
import { InMemoryAuditSink } from "@nimoguard/audit";
import { guardedReadFile, guardedWriteFile } from "./fs-guard.js";
import { guardedExec } from "./exec-guard.js";
import { AuthorizationError } from "./fs-guard.js";

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const sink = new InMemoryAuditSink();
const dir = await mkdtemp(path.join(tmpdir(), "nimoguard-enforce-demo-"));
const allowedFile = path.join(dir, "notes.txt");
const otherFile = path.join(dir, "..", "outside.txt");

const capabilities: Capability[] = [
  { id: "cap-write", agentId: "agent-1", action: "filesystem.write", scope: `${dir}/**` },
  { id: "cap-read", agentId: "agent-1", action: "filesystem.read", scope: `${dir}/**` },
  { id: "cap-echo", agentId: "agent-1", action: "command.execute", scope: "echo" },
];

console.log("\nNimoGuard enforce demo — this actually touches disk and runs a real command.\n");

async function step(title: string, fn: () => Promise<string>) {
  try {
    const result = await fn();
    console.log(`${green("DID IT")}  ${title}`);
    console.log(dim(`         ${result}`));
  } catch (err) {
    if (err instanceof AuthorizationError) {
      console.log(`${red("BLOCKED")}  ${title}`);
      console.log(dim(`         ${err.message}`));
    } else {
      throw err;
    }
  }
}

await step("Write notes.txt inside the granted sandbox dir", async () => {
  await guardedWriteFile("agent-1", allowedFile, "hello from NimoGuard", capabilities);
  return `wrote ${allowedFile}`;
});

await step("Read notes.txt back", async () => {
  const content = await guardedReadFile("agent-1", allowedFile, capabilities);
  return `read back: "${content}"`;
});

await step("Try to write outside the sandbox (not granted)", async () => {
  await guardedWriteFile("agent-1", otherFile, "should never land", capabilities, sink);
  return "wrote outside the sandbox — this should not happen";
});

await step("Run an allowed command (echo)", async () => {
  const { stdout } = await guardedExec("agent-1", "echo hello from a real child process", capabilities, sink);
  return `stdout: ${stdout.trim()}`;
});

await step("Try to run rm (not granted)", async () => {
  await guardedExec("agent-1", "rm -rf /tmp/should-not-run", capabilities, sink);
  return "ran rm — this should not happen";
});

await step("Try to chain echo with a semicolon (metacharacter guard)", async () => {
  await guardedExec("agent-1", "echo hi; echo should-not-run-separately", capabilities, sink);
  return "ran the chained command — this should not happen";
});

console.log(`\n${sink.records.length} blocked attempts recorded in the audit sink.`);
console.log(dim(`(sandbox dir: ${dir})\n`));

await rm(dir, { recursive: true, force: true });
