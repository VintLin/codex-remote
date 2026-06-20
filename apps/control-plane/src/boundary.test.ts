import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const sourceRoot = new URL("./", import.meta.url);

test("control plane source when importing workspace packages, should stay on public api boundary", () => {
  const source = readSourceFiles(sourceRoot);

  assert.match(source, /@codex-remote\/api-contract/);
  assert.match(source, /@codex-remote\/db/);
  assert.doesNotMatch(source, /@codex-remote\/codex-protocol/);
  assert.doesNotMatch(source, /from ["']\.\.\/\.\.\/worker\//);
  assert.doesNotMatch(source, /from ["']\.\.\/\.\.\/web\//);
});

function readSourceFiles(root: URL): string {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const entryUrl = new URL(entry.name, root);
      if (entry.isDirectory()) {
        return readSourceFiles(new URL(`${entry.name}/`, root));
      }

      const path = entryUrl.pathname;
      if (!path.endsWith(".ts")) {
        return [];
      }

      const stat = statSync(path);
      if (!stat.isFile()) {
        return [];
      }

      return readFileSync(join(path), "utf8");
    })
    .join("\n");
}
