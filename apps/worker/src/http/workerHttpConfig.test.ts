import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { loadWorkerHttpConfig } from "./workerHttpConfig.ts";

function createBaseEnv(root: string): NodeJS.ProcessEnv {
  return {
    CODEX_REMOTE_DEVICE_ID: "device-local",
    CODEX_REMOTE_WORKER_TOKEN: "example-token",
    CODEX_REMOTE_ALLOWED_ORIGINS: "http://127.0.0.1:5173,http://localhost:3000",
    CODEX_REMOTE_ALLOWED_PROJECT_ROOT: root,
    CODEX_REMOTE_HTTP_HOST: "127.0.0.1",
    CODEX_REMOTE_HTTP_PORT: "8787",
    CODEX_REMOTE_START_APP_SERVER: "false",
    CODEX_REMOTE_CONNECT_TIMEOUT_MS: "5000",
    CODEX_REMOTE_REQUEST_TIMEOUT_MS: "5000",
  };
}

test("worker http config when worker token is empty should reject", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "worker-http-config-"));
  const env = createBaseEnv(fixtureRoot);

  env.CODEX_REMOTE_WORKER_TOKEN = "  ";

  await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
});

test("worker http config when project root is missing should reject", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "worker-http-config-"));
  const env = createBaseEnv(fixtureRoot);

  delete env.CODEX_REMOTE_ALLOWED_PROJECT_ROOT;

  await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
});

test("worker http config when project root does not exist should reject", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "worker-http-config-"));
  const env = createBaseEnv(join(fixtureRoot, "missing-root"));

  await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
});

test("worker http config when wildcard origin is configured should reject", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "worker-http-config-"));
  const env = createBaseEnv(fixtureRoot);

  env.CODEX_REMOTE_ALLOWED_ORIGINS = "*";

  await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
});

test("worker http config when allowed origins contains blank segments should reject", async (t) => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "worker-http-config-"));

  await t.test("when allowed origins has trailing comma", async () => {
    const env = createBaseEnv(fixtureRoot);
    env.CODEX_REMOTE_ALLOWED_ORIGINS = "http://127.0.0.1:5173,";

    await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
  });

  await t.test("when allowed origins has double comma", async () => {
    const env = createBaseEnv(fixtureRoot);
    env.CODEX_REMOTE_ALLOWED_ORIGINS = "http://127.0.0.1:5173,,http://localhost:3000";

    await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
  });
});

test("worker http config when bind host is non-loopback should reject", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "worker-http-config-"));
  const env = createBaseEnv(fixtureRoot);

  env.CODEX_REMOTE_HTTP_HOST = "0.0.0.0";

  await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
});

test("worker http config when explicit empty defaulted values are provided should reject", async (t) => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "worker-http-config-"));

  await t.test("when bind host is empty", async () => {
    const env = createBaseEnv(fixtureRoot);
    env.CODEX_REMOTE_HTTP_HOST = "";

    await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
  });

  await t.test("when bind host is whitespace", async () => {
    const env = createBaseEnv(fixtureRoot);
    env.CODEX_REMOTE_HTTP_HOST = "   ";

    await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
  });

  await t.test("when port is empty", async () => {
    const env = createBaseEnv(fixtureRoot);
    env.CODEX_REMOTE_HTTP_PORT = "";

    await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
  });

  await t.test("when port is whitespace", async () => {
    const env = createBaseEnv(fixtureRoot);
    env.CODEX_REMOTE_HTTP_PORT = "   ";

    await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
  });

  await t.test("when start app server is empty", async () => {
    const env = createBaseEnv(fixtureRoot);
    env.CODEX_REMOTE_START_APP_SERVER = "";

    await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
  });

  await t.test("when start app server is whitespace", async () => {
    const env = createBaseEnv(fixtureRoot);
    env.CODEX_REMOTE_START_APP_SERVER = "   ";

    await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
  });
});

test("worker http config when timeout is invalid should reject", async (t) => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "worker-http-config-"));

  await t.test("when connect timeout is zero", async () => {
    const env = createBaseEnv(fixtureRoot);
    env.CODEX_REMOTE_CONNECT_TIMEOUT_MS = "0";

    await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
  });

  await t.test("when request timeout is negative", async () => {
    const env = createBaseEnv(fixtureRoot);
    env.CODEX_REMOTE_REQUEST_TIMEOUT_MS = "-10";

    await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
  });

  await t.test("when connect timeout is not a number", async () => {
    const env = createBaseEnv(fixtureRoot);
    env.CODEX_REMOTE_CONNECT_TIMEOUT_MS = "abc";

    await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
  });

  await t.test("when request timeout is too large", async () => {
    const env = createBaseEnv(fixtureRoot);
    env.CODEX_REMOTE_REQUEST_TIMEOUT_MS = "60001";

    await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
  });

  await t.test("when connect timeout is empty", async () => {
    const env = createBaseEnv(fixtureRoot);
    env.CODEX_REMOTE_CONNECT_TIMEOUT_MS = "";

    await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
  });

  await t.test("when request timeout is whitespace", async () => {
    const env = createBaseEnv(fixtureRoot);
    env.CODEX_REMOTE_REQUEST_TIMEOUT_MS = "   ";

    await assert.rejects(loadWorkerHttpConfig(env), /worker_config_invalid/);
  });
});

test("worker http config when config is valid should return canonical project root", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "worker-http-config-"));
  const allowedRoot = join(fixtureRoot, "allowed");
  const rootAliasParent = join(fixtureRoot, "aliases");
  const rootAlias = join(rootAliasParent, "allowed-link");

  mkdirSync(allowedRoot, { recursive: true });
  mkdirSync(rootAliasParent, { recursive: true });
  symlinkSync(allowedRoot, rootAlias);

  const config = await loadWorkerHttpConfig(createBaseEnv(join(rootAlias, "..", "allowed-link")));

  assert.equal(config.allowedProjectRoot, realpathSync(allowedRoot));
  assert.deepEqual(config.allowedOrigins, ["http://127.0.0.1:5173", "http://localhost:3000"]);
  assert.equal(config.bindHost, "127.0.0.1");
  assert.equal(config.port, 8787);
  assert.equal(config.startAppServer, false);
  assert.equal(config.appServerUrl, null);
  assert.equal(config.appServerTransport, "stdio");
  assert.equal(config.connectTimeoutMs, 5000);
  assert.equal(config.requestTimeoutMs, 5000);
});

test("worker http config when project root validation fails should not leak sensitive input", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "worker-http-config-"));
  const outsideRoot = join(fixtureRoot, "outside");
  const env = createBaseEnv(fixtureRoot);

  env.CODEX_REMOTE_WORKER_TOKEN = "secret-token";
  env.CODEX_APP_SERVER_URL = "ws://127.0.0.1:4318/private?token=secret";
  env.CODEX_REMOTE_ALLOWED_PROJECT_ROOT = join(outsideRoot, dirname("secret-project"));

  await assert.rejects(
    loadWorkerHttpConfig(env),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /worker_config_invalid/);
      assert.doesNotMatch(error.message, /secret-token/);
      assert.doesNotMatch(error.message, /ws:\/\/127\.0\.0\.1:4318/);
      assert.doesNotMatch(error.message, /outside/);
      return true;
    },
  );
});

test("worker http config when app server url is invalid should not leak raw url", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "worker-http-config-"));
  const env = createBaseEnv(fixtureRoot);

  env.CODEX_APP_SERVER_URL = "ws://127.0.0.1:4318/private?token=secret";

  await assert.rejects(
    loadWorkerHttpConfig(env),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /worker_config_invalid/);
      assert.doesNotMatch(error.message, /ws:\/\/127\.0\.0\.1:4318\/private\?token=secret/);
      return true;
    },
  );
});
