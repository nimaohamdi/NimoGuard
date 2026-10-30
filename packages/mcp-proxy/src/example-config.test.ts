import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadConfig } from "./config.js";

const packageDir = fileURLToPath(new URL("..", import.meta.url));

for (const name of [
  "nimoguard.config.example.json",
  "nimoguard.config.approval.example.json",
]) {
  test(`${name} is a valid config`, async () => {
    const config = await loadConfig(path.join(packageDir, name));
    assert.ok(config.capabilities.length > 0);
  });
}

test("the approval example actually enables approval", async () => {
  const config = await loadConfig(
    path.join(packageDir, "nimoguard.config.approval.example.json"),
  );
  assert.equal(config.approval?.authTokenEnv, "NIMOGUARD_APPROVAL_TOKEN");
});
