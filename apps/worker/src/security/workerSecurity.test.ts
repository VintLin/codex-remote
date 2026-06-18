import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  canReadThreadPath,
  isBearerTokenAuthorized,
  isOriginAllowed,
  isPathInsideRoot,
  isPathInsideRootRealpath,
} from "./workerSecurity.ts";

test("when checking bearer token, should require exact bearer header", () => {
  assert.equal(isBearerTokenAuthorized("Bearer dev-token", "dev-token"), true);
  assert.equal(isBearerTokenAuthorized("dev-token", "dev-token"), false);
  assert.equal(isBearerTokenAuthorized(undefined, "dev-token"), false);
  assert.equal(isBearerTokenAuthorized("Bearer ", ""), false);
});

test("when checking browser origin, should allow configured origins and non-browser requests", () => {
  assert.equal(isOriginAllowed(undefined, ["http://127.0.0.1:5173"]), true);
  assert.equal(isOriginAllowed("http://127.0.0.1:5173", ["http://127.0.0.1:5173"]), true);
  assert.equal(isOriginAllowed("http://evil.example", ["http://127.0.0.1:5173"]), false);
});

test("when checking project allowlist, should reject sibling and unknown thread paths", () => {
  assert.equal(isPathInsideRoot("/repo/project", "/repo/project"), true);
  assert.equal(isPathInsideRoot("/repo/project/sub", "/repo/project"), true);
  assert.equal(isPathInsideRoot("/repo/project-other", "/repo/project"), false);
  assert.equal(isPathInsideRoot("/repo/project", ""), false);
  assert.equal(canReadThreadPath(null, "/repo/project"), false);
});

test("when checking canonical project allowlist, should reject a symlink escape", async () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "worker-security-"));
  const allowedRoot = join(fixtureRoot, "allowed");
  const outsideRoot = join(fixtureRoot, "outside");
  const insideDir = join(allowedRoot, "inside");
  const escapeLink = join(insideDir, "escape-link");
  const escapedFile = join(escapeLink, "secret.txt");

  mkdirSync(insideDir, { recursive: true });
  mkdirSync(outsideRoot, { recursive: true });
  writeFileSync(join(outsideRoot, "secret.txt"), "secret");
  symlinkSync(outsideRoot, escapeLink);

  assert.equal(await isPathInsideRootRealpath(escapedFile, allowedRoot), false);
});
