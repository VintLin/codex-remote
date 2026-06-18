import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

export interface AppServerProcessHandle {
  child: ChildProcess;
  spawned: Promise<void>;
  url: string;
  readyzUrl: string;
  startedByWorker: true;
}

function createAppServerProcessError(
  kind: "app_server_request_timeout" | "app_server_spawn_failed",
): Error {
  return new Error(kind);
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

  while (true) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw createAppServerProcessError("app_server_request_timeout");
    }

    const controller = new AbortController();
    const attemptTimeoutMs = Math.min(remainingMs, 250);
    const attemptTimeout = setTimeout(() => {
      controller.abort();
    }, attemptTimeoutMs);

    try {
      const response = await fetch(readyzUrl, {
        signal: controller.signal,
      });
      if (response.ok) {
        return;
      }
    } catch {
      if (Date.now() >= deadline) {
        throw createAppServerProcessError("app_server_request_timeout");
      }
    } finally {
      clearTimeout(attemptTimeout);
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }
}

export function startLoopbackAppServer(port: number): AppServerProcessHandle {
  const url = assertLoopbackWebSocketUrl(`ws://127.0.0.1:${port}`);
  const child = spawn("codex", ["app-server", "--listen", url], {
    stdio: "ignore",
  });
  const spawned = new Promise<void>((resolve, reject) => {
    child.once("spawn", () => {
      resolve();
    });
    child.once("error", () => {
      reject(createAppServerProcessError("app_server_spawn_failed"));
    });
  });

  return {
    child,
    spawned,
    url,
    readyzUrl: toReadyzUrl(url),
    startedByWorker: true,
  };
}

export function stopAppServer(handle: AppServerProcessHandle): void {
  handle.child.kill("SIGTERM");
}
