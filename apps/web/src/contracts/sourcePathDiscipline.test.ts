import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function collectTestFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

test("when test files read source code, should avoid process.cwd and hardcoded absolute paths", () => {
  const sourceRoot = new URL("../", import.meta.url).pathname;
  const testFiles = collectTestFiles(sourceRoot);
  const offenders = new Set<string>();
  const forbiddenProcessPathCall = "process" + ".cwd()";
  const forbiddenHomePath = "/" + "Users/";
  const forbiddenPrivatePath = "/" + "private/";
  const forbiddenWindowsDrivePath = "C:" + "\\";

  for (const file of testFiles) {
    const source = readFileSync(file, "utf8");
    if (source.includes(forbiddenProcessPathCall)) {
      offenders.add(file);
    }
    if (
      source.includes(forbiddenHomePath) ||
      source.includes(forbiddenPrivatePath) ||
      source.includes(forbiddenWindowsDrivePath)
    ) {
      offenders.add(file);
    }
  }

  assert.deepEqual([...offenders], []);
});
