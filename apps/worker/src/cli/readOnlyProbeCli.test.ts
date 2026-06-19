import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

test("read-only probe cli: when codex spawn fails, should print a structured sanitized probe summary", async () => {
  const child = spawn(process.execPath, ["src/cli/readOnlyProbeCli.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CODEX_REMOTE_START_APP_SERVER: "1",
      PATH: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  child.stdout.on("data", (chunk: Buffer) => {
    stdoutChunks.push(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk);
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });

  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  assert.notEqual(stdout.trim(), "", `stdout was empty; stderr: ${stderr}`);
  const summary = JSON.parse(stdout);

  assert.equal(exitCode, 1);
  assert.equal(summary.ok, false);
  assert.equal(summary.checks[0]?.name, "app-server.connect");
  assert.equal(summary.checks[0]?.errorKind, "app_server_spawn_failed");
  assert.equal(summary.checks[0]?.failureType, "assertion_failed");
  assert.match(stdout, /"app_server_spawn_failed"/);
  assert.doesNotMatch(stdout, /ENOENT|EACCES|spawn codex/i);
  assert.equal(stderr, "");
});

test("read-only probe cli: when app-server env is not configured, should print the structured probe summary instead of crashing", async () => {
  const child = spawn(process.execPath, ["src/cli/readOnlyProbeCli.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CODEX_APP_SERVER_URL: "",
      CODEX_REMOTE_START_APP_SERVER: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  child.stdout.on("data", (chunk: Buffer) => {
    stdoutChunks.push(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderrChunks.push(chunk);
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });

  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  assert.notEqual(stdout.trim(), "", `stdout was empty; stderr: ${stderr}`);
  const summary = JSON.parse(stdout);

  assert.equal(exitCode, 1);
  assert.equal(summary.ok, false);
  assert.equal(summary.checks[0]?.name, "probe.client");
  assert.equal(summary.checks[0]?.failureType, "env_not_configured");
  assert.equal(summary.checks[0]?.skippedReason, "No app-server client was provided.");
  assert.equal(summary.appServer?.startedByWorker, false);
  assert.doesNotMatch(stdout, /ws:\/\/127\.0\.0\.1|http:\/\/127\.0\.0\.1|CODEX_APP_SERVER_URL/);
  assert.equal(stderr, "");
});
