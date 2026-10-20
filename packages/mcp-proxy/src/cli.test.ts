import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const exampleConfig = path.join(
  fileURLToPath(new URL("..", import.meta.url)),
  "nimoguard.config.example.json",
);

test("exits 1 with a clear message when --config is missing", async () => {
  await assert.rejects(
    async () => execFileAsync("node", [cliPath]),
    (err: unknown) => {
      const e = err as { code: number; stderr: string };
      assert.equal(e.code, 1);
      assert.match(e.stderr, /missing required flag: --config/);
      return true;
    },
  );
});

test("exits 1 with a clear message when the config file does not exist", async () => {
  await assert.rejects(
    async () => execFileAsync("node", [cliPath, "--config", "/tmp/does-not-exist-nimoguard.json"]),
    (err: unknown) => {
      const e = err as { code: number; stderr: string };
      assert.equal(e.code, 1);
      assert.match(e.stderr, /could not read file/);
      return true;
    },
  );
});

test("starts successfully with a valid example config and stays running until killed", async () => {
  const child = execFileAsync("node", [cliPath, "--config", exampleConfig], { timeout: 1500 });
  await assert.rejects(
    async () => child,
    (err: unknown) => {
      // A timeout-killed process rejects with a `killed: true` / SIGTERM
      // error, not a parsed error message — proving it stayed alive
      // instead of crashing immediately.
      const e = err as { killed?: boolean; signal?: string };
      return e.killed === true || e.signal === "SIGTERM";
    },
  );
});
