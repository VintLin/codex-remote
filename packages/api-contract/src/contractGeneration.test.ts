import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const packageRoot = new URL("../", import.meta.url);
const openApiPath = new URL("openapi.yaml", packageRoot);
const generatedPath = new URL("generated/openapi.ts", import.meta.url);
const publicExportsPath = new URL("index.ts", import.meta.url);

test("when api contract schemas are maintained, openapi.yaml should be the source file", () => {
  const source = readFileSync(openApiPath, "utf8");

  assert.match(source, /^openapi: 3\.1\.0/m);
  assert.match(source, /Device:/);
  assert.match(source, /RemoteProject:/);
  assert.match(source, /CodexConversation:/);
  assert.match(source, /FollowUpInput:/);
});

test("when generated types are consumed, the generated openapi file should exist", () => {
  assert.equal(existsSync(generatedPath), true);
});

test("when public api types are exported, index should not redeclare schema fields", () => {
  const source = readFileSync(publicExportsPath, "utf8");
  const forbiddenDefinitions = source
    .split("\n")
    .filter((line) =>
      /^(export\s+)?interface\s+(Device|RemoteProject|CodexConversation|BoardTask|DiffLine)\b/.test(line.trim()) ||
      /^(export\s+)?type\s+(Device|RemoteProject|CodexConversation|BoardTask|DiffLine)\s*=\s*\{/.test(
        line.trim(),
      ),
    );

  assert.deepEqual(forbiddenDefinitions, []);
  assert.match(source, /from "\.\/generated\/openapi"/);
});
