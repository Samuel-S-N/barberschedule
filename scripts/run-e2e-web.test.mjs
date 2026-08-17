import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { waitForExit } from "./run-e2e-web.mjs";

const exitsQuickly = (promise) =>
  Promise.race([promise, delay(1_000, "timed out")]);

test("reuses a child exit result", async () => {
  const child = spawn(process.execPath, ["-e", ""]);
  const result = await waitForExit(child);

  assert.deepEqual(await exitsQuickly(waitForExit(child)), result);
});

test("resolves when the child already exited", async () => {
  const child = spawn(process.execPath, ["-e", ""]);
  await new Promise((resolve) => child.once("exit", resolve));

  assert.deepEqual(await exitsQuickly(waitForExit(child)), {
    code: 0,
    signal: null,
  });
});

test("reuses a spawn error", async () => {
  const child = spawn("barberschedule-command-that-does-not-exist");
  const firstWait = waitForExit(child);

  await assert.rejects(firstWait, { code: "ENOENT" });
  await assert.rejects(exitsQuickly(waitForExit(child)), { code: "ENOENT" });
});
