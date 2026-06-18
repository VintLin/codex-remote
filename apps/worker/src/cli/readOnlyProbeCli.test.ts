import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

test("when codex spawn fails, should print a structured sanitized probe summary", async () => {
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
