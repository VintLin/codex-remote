import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const repoRoot = new URL("../../../../", import.meta.url).pathname;

test("worker architecture boundary when app-server protocol is imported, should limit usage to worker", () => {
  const violations = collectTypeScriptFiles(join(repoRoot, "apps"), join(repoRoot, "packages"))
    .filter((filePath) => !relative(repoRoot, filePath).startsWith("apps/worker/"))
    .filter((filePath) => importedPackages(readFileSync(filePath, "utf8")).includes("@codex-remote/codex-protocol"))
    .map((filePath) => relative(repoRoot, filePath));

  assert.deepEqual(violations, []);
});

test("worker architecture boundary when http modules are maintained, should not import web code", () => {
  const violations = collectTypeScriptFiles(join(repoRoot, "apps/worker/src/http"))
    .filter((filePath) => /from\s+["'][^"']*apps\/web|from\s+["']@codex-remote\/web/.test(readFileSync(filePath, "utf8")))
    .map((filePath) => relative(repoRoot, filePath));

  assert.deepEqual(violations, []);
});

test("worker architecture boundary when public API types are used, should consume api-contract", () => {
  const httpSources = collectTypeScriptFiles(join(repoRoot, "apps/worker/src/http"))
    .map((filePath) => readFileSync(filePath, "utf8"))
    .join("\n");

  assert.match(httpSources, /@codex-remote\/api-contract/);
  assert.doesNotMatch(httpSources, /type\s+CodexConversation\s*=/);
  assert.doesNotMatch(httpSources, /interface\s+CodexConversation\b/);
  assert.doesNotMatch(httpSources, /type\s+ConversationTimeline\s*=/);
  assert.doesNotMatch(httpSources, /interface\s+ConversationTimeline\b/);
});

test("worker architecture boundary when stage 4 routes are maintained, should expose only scoped write paths", () => {
  const source = readFileSync(join(repoRoot, "apps/worker/src/http/workerHttpApp.ts"), "utf8");
  const forbiddenRouteTokens = ["approval", "interrupt", "steer", "stream"];
  const postRoutes = [...source.matchAll(/app\.post\("([^"]+)"/g)].map((match) => match[1]);

  assert.match(source, /\/v1\/worker\/health/);
  assert.match(source, /\/v1\/worker\/capabilities/);
  assert.match(source, /\/v1\/worker\/probe/);
  assert.match(source, /\/v1\/conversations/);
  assert.match(source, /\/v1\/conversations\/:conversationId\/timeline/);
  assert.deepEqual(postRoutes.sort(), [
    "/v1/conversations",
    "/v1/conversations/:conversationId/follow-up",
  ]);

  for (const token of forbiddenRouteTokens) {
    assert.doesNotMatch(source, new RegExp(token, "i"));
  }
});

function collectTypeScriptFiles(...roots: string[]): string[] {
  return roots.flatMap((root) => collectFiles(root));
}

function collectFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".turbo") {
        continue;
      }
      files.push(...collectFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      files.push(fullPath);
    }
  }

  return files;
}

function importedPackages(source: string): string[] {
  const imports = new Set<string>();
  const importPattern =
    /from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = importPattern.exec(source)) !== null) {
    const importPath = match[1] ?? match[2] ?? match[3];
    if (importPath) {
      imports.add(importPath);
    }
  }

  return [...imports];
}
