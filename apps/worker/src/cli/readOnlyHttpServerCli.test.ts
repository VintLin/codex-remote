import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { startReadOnlyHttpServer } from "./readOnlyHttpServerCli.ts";

test("read-only http server cli when config is invalid, should fail without binding", async () => {
  const writes = createWritable();
  let served = false;

  const exitCode = await startReadOnlyHttpServer({
    env: {},
    stdout: writes.stdout,
    stderr: writes.stderr,
    serveHttp: () => {
      served = true;
      throw new Error("should_not_bind");
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(served, false);
  assert.match(writes.stderrText(), /worker_config_invalid/);
});

test("read-only http server cli when config is valid, should bind loopback and print safe startup line", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-http-cli-"));
  const writes = createWritable();
  const servedOptions: Array<{ hostname: string | undefined; port: number | undefined }> = [];
  const token = "example-token";
  const appServerUrl = "ws://127.0.0.1:4321";

  const exitCode = await startReadOnlyHttpServer({
    env: {
      CODEX_REMOTE_WORKER_TOKEN: token,
      CODEX_REMOTE_ALLOWED_PROJECT_ROOT: projectRoot,
      CODEX_REMOTE_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
      CODEX_REMOTE_HTTP_HOST: "127.0.0.1",
      CODEX_REMOTE_HTTP_PORT: "8877",
      CODEX_APP_SERVER_URL: appServerUrl,
    },
    stdout: writes.stdout,
    stderr: writes.stderr,
    serveHttp: (options) => {
      servedOptions.push({ hostname: options.hostname, port: options.port });
      return undefined as never;
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(servedOptions, [{ hostname: "127.0.0.1", port: 8877 }]);
  assert.match(writes.stdoutText(), /127\.0\.0\.1:8877/);
  assert.doesNotMatch(writes.stdoutText(), new RegExp(token));
  assert.doesNotMatch(writes.stdoutText(), /ws:\/\/127\.0\.0\.1:4321/);
  assert.equal(writes.stderrText(), "");
});

test("read-only http server cli when server binding fails, should print sanitized internal error", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-http-cli-"));
  const writes = createWritable();
  const token = "example-token";
  const appServerUrl = "ws://127.0.0.1:4321";

  const exitCode = await startReadOnlyHttpServer({
    env: {
      CODEX_REMOTE_WORKER_TOKEN: token,
      CODEX_REMOTE_ALLOWED_PROJECT_ROOT: projectRoot,
      CODEX_REMOTE_ALLOWED_ORIGINS: "http://127.0.0.1:5173",
      CODEX_APP_SERVER_URL: appServerUrl,
    },
    stdout: writes.stdout,
    stderr: writes.stderr,
    serveHttp: () => {
      throw new Error(`bind failed ${token} ${appServerUrl}`);
    },
  });

  assert.equal(exitCode, 1);
  assert.match(writes.stderrText(), /worker_internal_error/);
  assert.doesNotMatch(writes.stderrText(), new RegExp(token));
  assert.doesNotMatch(writes.stderrText(), /ws:\/\/127\.0\.0\.1:4321/);
});


function createWritable(): {
  stdout: { write(chunk: string): boolean };
  stderr: { write(chunk: string): boolean };
  stdoutText(): string;
  stderrText(): string;
} {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  return {
    stdout: {
      write(chunk: string): boolean {
        stdoutChunks.push(chunk);
        return true;
      },
    },
    stderr: {
      write(chunk: string): boolean {
        stderrChunks.push(chunk);
        return true;
      },
    },
    stdoutText: () => stdoutChunks.join(""),
    stderrText: () => stderrChunks.join(""),
  };
}
