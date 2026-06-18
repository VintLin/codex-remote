import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function collectFiles(dir: string, predicate: (name: string) => boolean): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, predicate));
    } else if (entry.isFile() && predicate(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

test("when scanning web source files, should keep business entities out of local mockData definitions", () => {
  const sourceRoot = new URL("../", import.meta.url).pathname;
  const sourceFiles = collectFiles(sourceRoot, (name) => name.endsWith(".ts") || name.endsWith(".tsx"));
  const mockDataSource = sourceFiles.filter((file) => file.endsWith("/data/app-server/mockData.ts"));
  assert.equal(mockDataSource.length, 1);

  const source = readFileSync(mockDataSource[0]!, "utf8");
  const definitionLines = source
    .split("\n")
    .filter((line) =>
      /^(export\s+)?(interface|type)\s+(Device|RemoteProject|CodexConversation|BoardTask|DiffLine)\b/.test(
        line.trim(),
      ),
    );
  assert.deepEqual(definitionLines, []);
});
