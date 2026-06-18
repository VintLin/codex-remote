import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";

export interface AppServerProcessHandle {
  child: ChildProcessWithoutNullStreams;
  url: string;
  readyzUrl: string;
  startedByWorker: true;
}

export function assertLoopbackWebSocketUrl(value: string): string {
  const url = new URL(value);

  if (
    url.protocol !== "ws:" ||
    url.hostname !== "127.0.0.1" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !url.port
  ) {
    throw new Error("app_server_url_not_loopback");
  }

  return url.toString();
}

export async function chooseLoopbackPort(): Promise<number> {
  return await new Promise((resolvePromise, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address) {
          resolvePromise(address.port);
          return;
        }

        reject(new Error("Unable to allocate loopback port"));
      });
    });
  });
}

export function toReadyzUrl(appServerUrl: string): string {
  const url = new URL(assertLoopbackWebSocketUrl(appServerUrl));
  url.protocol = "http:";
  url.pathname = "/readyz";
  url.search = "";
  url.hash = "";

  return url.toString();
}

export async function waitForReadyz(readyzUrl: string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(readyzUrl);
      if (response.ok) {
        return;
      }

      lastError = new Error(`readyz returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  throw lastError instanceof Error ? lastError : new Error("app-server /readyz timed out");
}

export function startLoopbackAppServer(port: number): AppServerProcessHandle {
  const url = assertLoopbackWebSocketUrl(`ws://127.0.0.1:${port}`);
  const child = spawn("codex", ["app-server", "--listen", url], {
    stdio: ["ignore", "pipe", "pipe"],
  }) as unknown as ChildProcessWithoutNullStreams;

  return {
    child,
    url,
    readyzUrl: toReadyzUrl(url),
    startedByWorker: true,
  };
}

export function stopAppServer(handle: AppServerProcessHandle): void {
  handle.child.kill("SIGTERM");
}
