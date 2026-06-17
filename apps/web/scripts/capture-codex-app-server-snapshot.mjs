import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const projectCwd = process.env.CODEX_REMOTE_SNAPSHOT_CWD ?? process.cwd();
const outDir = path.resolve("apps/web/.local-fixtures/app-server");
const listOut = path.join(outDir, "demo.thread-list.json");
const readOut = path.join(outDir, "demo.thread-read.json");
const sidebarStateOut = path.join(outDir, "demo.sidebar-state.json");
const requestTimeoutMs = 30_000;

let nextId = 1;
const pending = new Map();
const stderr = [];
let serverExitError = null;

const proc = spawn("codex", ["app-server", "--listen", "stdio://"], {
  cwd: projectCwd,
  stdio: ["pipe", "pipe", "pipe"],
});

proc.stderr.on("data", (chunk) => {
  stderr.push(chunk.toString());
});

proc.on("error", (error) => {
  serverExitError = error;
  rejectPending(error);
});

proc.on("close", (code, signal) => {
  serverExitError = new Error(
    `codex app-server exited before all requests completed: code=${code}, signal=${signal}`,
  );
  rejectPending(serverExitError);
});

const rl = readline.createInterface({ input: proc.stdout });

rl.on("line", (line) => {
  if (!line.trim()) {
    return;
  }

  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    rejectPending(error);
    return;
  }

  if (typeof message.id === "undefined") {
    return;
  }

  const entry = pending.get(message.id);
  if (!entry) {
    return;
  }

  pending.delete(message.id);
  clearTimeout(entry.timer);

  if (message.error) {
    entry.reject(new Error(`${entry.method} failed: ${JSON.stringify(message.error)}`));
    return;
  }

  entry.resolve(message.result);
});

function rejectPending(error) {
  for (const [id, entry] of pending.entries()) {
    pending.delete(id);
    clearTimeout(entry.timer);
    entry.reject(error);
  }
}

function getStdinWriteError() {
  if (serverExitError) {
    return serverExitError;
  }

  if (proc.stdin.destroyed || proc.stdin.writableEnded || !proc.stdin.writable) {
    return new Error("codex app-server stdin is not writable");
  }

  return null;
}

function sendNotification(method, params) {
  const writeError = getStdinWriteError();
  if (writeError) {
    return Promise.reject(writeError);
  }

  const payload = typeof params === "undefined" ? { method } : { method, params };
  const serialized = `${JSON.stringify(payload)}\n`;

  return new Promise((resolve, reject) => {
    try {
      proc.stdin.write(serialized, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

function request(method, params = {}, timeoutMs = requestTimeoutMs) {
  const writeError = getStdinWriteError();
  if (writeError) {
    return Promise.reject(writeError);
  }

  const id = nextId;
  nextId += 1;

  const payload = { id, method, params };
  const serialized = `${JSON.stringify(payload)}\n`;

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    pending.set(id, { method, resolve, reject, timer });

    try {
      proc.stdin.write(serialized, (error) => {
        if (!error) {
          return;
        }

        const entry = pending.get(id);
        if (!entry) {
          return;
        }

        pending.delete(id);
        clearTimeout(entry.timer);
        entry.reject(error);
      });
    } catch (error) {
      pending.delete(id);
      clearTimeout(timer);
      reject(error);
    }
  });
}

function getPageThreads(page) {
  return page.data ?? page.threads ?? page.items ?? [];
}

function toFixturePage(page) {
  if (Array.isArray(page.threads) || !Array.isArray(page.data)) {
    return page;
  }

  return {
    ...page,
    threads: page.data,
  };
}

async function listAllThreads() {
  const pages = [];
  let cursor = null;

  do {
    const result = await request("thread/list", {
      archived: false,
      cursor,
      limit: 100,
      modelProviders: [],
      sortKey: "updated_at",
      sortDirection: "desc",
    });

    pages.push(toFixturePage(result));
    cursor = result.cursor ?? result.nextCursor ?? null;
  } while (cursor);

  return pages;
}

async function readThreads(threadIds) {
  const reads = {};

  for (const threadId of threadIds) {
    reads[threadId] = await request("thread/read", {
      threadId,
      includeTurns: true,
    });
  }

  return reads;
}

function sanitizeLog(value) {
  return value
    .replace(/([A-Za-z0-9_-]*token[A-Za-z0-9_-]*["'\s:=]+)(["']?)[^"'\s]+/gi, "$1$2REDACTED")
    .replace(/(authorization["'\s:=]+)(["']?)[^"'\s]+/gi, "$1$2REDACTED")
    .replace(/(api[_-]?key["'\s:=]+)(["']?)[^"'\s]+/gi, "$1$2REDACTED");
}

async function readSidebarStateFixture() {
  const globalStatePath = path.join(os.homedir(), ".codex", ".codex-global-state.json");
  const raw = JSON.parse(await readFile(globalStatePath, "utf8"));
  return {
    projectOrder: raw["project-order"] ?? [],
    savedWorkspaceRoots: raw["electron-saved-workspace-roots"] ?? [],
    activeWorkspaceRoots: raw["active-workspace-roots"] ?? [],
    pinnedProjectIds: raw["pinned-project-ids"] ?? [],
    collapsedGroups: raw["electron-persisted-atom-state"]?.["sidebar-collapsed-groups"] ?? {},
    labels: raw["electron-workspace-root-labels"] ?? {},
    projectlessThreadIds: raw["projectless-thread-ids"] ?? [],
    threadWorkspaceRootHints: raw["thread-workspace-root-hints"] ?? {},
    threadProjectlessOutputDirectories: raw["thread-projectless-output-directories"] ?? {},
  };
}

async function main() {
  await mkdir(outDir, { recursive: true });

  await request("initialize", {
    clientInfo: {
      name: "codex_remote_snapshot",
      title: "Codex Remote Snapshot",
      version: "0.1.0",
    },
    capabilities: {
      experimentalApi: true,
    },
  });
  await sendNotification("initialized");

  const listPages = await listAllThreads();
  const threadIds = listPages
    .flatMap(getPageThreads)
    .map((thread) => thread.id)
    .filter((id) => typeof id === "string");
  const reads = await readThreads(threadIds);
  const sidebarState = await readSidebarStateFixture();
  const readCount = Object.keys(reads).length;
  if (threadIds.length !== readCount) {
    throw new Error(`thread/read count mismatch: listed=${threadIds.length}, read=${readCount}`);
  }
  const capturedAt = new Date().toISOString();

  await writeFile(
    listOut,
    `${JSON.stringify({ projectCwd, capturedAt, pages: listPages }, null, 2)}\n`,
  );
  await writeFile(
    readOut,
    `${JSON.stringify({ projectCwd, capturedAt, threads: reads }, null, 2)}\n`,
  );
  await writeFile(
    sidebarStateOut,
    `${JSON.stringify(sidebarState, null, 2)}\n`,
  );

  console.log(
    JSON.stringify(
      {
        pages: listPages.length,
        listed: threadIds.length,
        read: readCount,
        projects: sidebarState.projectOrder.length,
      },
      null,
      2,
    ),
  );
}

try {
  await main();
} catch (error) {
  console.error(sanitizeLog(error?.stack ?? String(error)));
  if (stderr.length > 0) {
    console.error(sanitizeLog(stderr.join("")));
  }
  process.exitCode = 1;
} finally {
  rl.close();
  if (!proc.stdin.destroyed && !proc.stdin.writableEnded) {
    proc.stdin.end();
  }
  proc.kill();
}
