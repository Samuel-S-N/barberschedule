import { spawn } from "node:child_process";
import { request } from "node:http";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import {
  getE2EWebBaseUrl,
  selectE2EWebPort,
} from "../src/lib/testing/e2e-web.ts";

const STARTUP_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 250;
const exitPromises = new WeakMap();

export function waitForExit(child) {
  if (!exitPromises.has(child)) {
    exitPromises.set(
      child,
      child.exitCode !== null || child.signalCode !== null
        ? Promise.resolve({ code: child.exitCode, signal: child.signalCode })
        : new Promise((resolve, reject) => {
            child.once("error", reject);
            child.once("exit", (code, signal) => resolve({ code, signal }));
          }),
    );
  }

  return exitPromises.get(child);
}

function pipeOutput(stream, writer) {
  if (!stream) {
    return;
  }

  stream.on("data", (chunk) => {
    writer.write(chunk);
  });
}

function spawnLogged(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    detached: command === "npx" && args[0] === "expo",
    stdio: ["ignore", "pipe", "pipe"],
  });

  pipeOutput(child.stdout, process.stdout);
  pipeOutput(child.stderr, process.stderr);
  void waitForExit(child).catch(() => {});

  return child;
}

function ping(url) {
  return new Promise((resolve) => {
    const req = request(url, { method: "GET" }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 500);
    });

    req.on("error", () => resolve(false));
    req.setTimeout(1_000, () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function waitForHttpReady(url, child) {
  const startedAt = Date.now();
  const exited = waitForExit(child).then(() => {
    throw new Error(`Expo web server exited before becoming ready at ${url}`);
  });

  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (await Promise.race([ping(url), exited])) {
      return;
    }

    await Promise.race([delay(POLL_INTERVAL_MS), exited]);
  }

  throw new Error(`Timed out waiting for Expo web server at ${url}`);
}

async function main() {
  const webPort = await selectE2EWebPort();
  const baseURL = getE2EWebBaseUrl(webPort);
  const env = {
    ...process.env,
    BARBERSCHEDULE_E2E_WEB_PORT: String(webPort),
    CI: process.env.CI ?? "1",
    EXPO_NO_DOTENV: "1",
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      "test-publishable-key",
    EXPO_PUBLIC_SUPABASE_URL:
      process.env.EXPO_PUBLIC_SUPABASE_URL ??
      "https://example.supabase.co",
    PLAYWRIGHT_TEST_BASE_URL: baseURL,
  };

  const expo = spawnLogged("npx", ["expo", "start", "--web", "--clear", "--port", String(webPort)], {
    cwd: process.cwd(),
    env,
  });

  let stopExpoPromise;
  const stopExpo = () => {
    stopExpoPromise ??= (async () => {
      if (
        expo.pid !== undefined &&
        expo.exitCode === null &&
        expo.signalCode === null
      ) {
        process.kill(-expo.pid, "SIGINT");
        await Promise.race([
          waitForExit(expo),
          delay(3_000).then(() => {
            if (expo.exitCode === null && expo.signalCode === null) {
              process.kill(-expo.pid, "SIGKILL");
            }
          }),
        ]);
      }
    })();

    return stopExpoPromise;
  };

  const handleSigint = () => {
    void stopExpo();
  };
  const handleSigterm = () => {
    void stopExpo();
  };

  process.once("SIGINT", handleSigint);
  process.once("SIGTERM", handleSigterm);

  try {
    await waitForHttpReady(baseURL, expo);

    const playwright = spawnLogged(
      "npx",
      ["playwright", "test", "--config=playwright.config.ts"],
      {
        cwd: process.cwd(),
        env,
      },
    );

    const result = await waitForExit(playwright);

    if (result.signal) {
      throw new Error(`Playwright exited from signal ${result.signal}`);
    }

    process.exitCode = result.code ?? 1;
  } finally {
    await stopExpo();
    await waitForExit(expo).catch(() => {});
    process.removeListener("SIGINT", handleSigint);
    process.removeListener("SIGTERM", handleSigterm);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
