import { createServer } from "node:net";

export const DEFAULT_E2E_WEB_PORT = 4173;
const DEFAULT_MAX_E2E_WEB_PORT = DEFAULT_E2E_WEB_PORT + 20;

type PortAvailabilityCheck = (port: number) => Promise<boolean>;

type SelectE2EWebPortOptions = {
  isPortAvailable?: PortAvailabilityCheck;
  maxPort?: number;
  preferredPort?: number;
};

export function getE2EWebPort() {
  const configuredPort = Number(process.env.BARBERSCHEDULE_E2E_WEB_PORT);

  if (Number.isInteger(configuredPort) && configuredPort > 0) {
    return configuredPort;
  }

  return DEFAULT_E2E_WEB_PORT;
}

export function getE2EWebBaseUrl(port = getE2EWebPort()) {
  return `http://127.0.0.1:${port}`;
}

export async function isLocalhostPortAvailable(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = createServer();

    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        resolve(false);
        return;
      }

      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "127.0.0.1");
  });
}

export async function selectE2EWebPort({
  isPortAvailable = isLocalhostPortAvailable,
  maxPort = DEFAULT_MAX_E2E_WEB_PORT,
  preferredPort = getE2EWebPort(),
}: SelectE2EWebPortOptions = {}) {
  for (let port = preferredPort; port <= maxPort; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(
    `No free localhost port found for BARBERSCHEDULE_E2E_WEB_PORT starting at ${preferredPort} and ending at ${maxPort}`,
  );
}
