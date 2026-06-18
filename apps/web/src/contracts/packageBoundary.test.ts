import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

interface ImportViolation {
  file: string;
  importPath: string;
  rule: string;
}

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".turbo" || entry.name === "dist") {
        continue;
      }
      files.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      files.push(fullPath);
    }
  }

  return files;
}

function importedPackages(source: string): string[] {
  const imports = new Set<string>();
  const importPattern = /from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = importPattern.exec(source)) !== null) {
    const importPath = match[1] ?? match[2];
    if (importPath) {
      imports.add(importPath);
    }
  }

  return [...imports];
}

function findViolations(): ImportViolation[] {
  const workspaceRoot = new URL("../../../../", import.meta.url).pathname;
  const sourceRoots = [
    join(workspaceRoot, "apps/web/src"),
    join(workspaceRoot, "packages/ui/src"),
    join(workspaceRoot, "packages/api-contract/src"),
  ];
  const existingRoots = sourceRoots.filter((root) => {
    try {
      readdirSync(root);
      return true;
    } catch {
      return false;
    }
  });
  const files = existingRoots.flatMap(collectSourceFiles);
  const violations: ImportViolation[] = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const imports = importedPackages(source);
    const relativeFile = relative(workspaceRoot, file);

    for (const importPath of imports) {
      if (relativeFile.startsWith("apps/web/") && importPath === "@codex-remote/codex-protocol") {
        violations.push({
          file: relativeFile,
          importPath,
          rule: "apps/web must not import codex-protocol",
        });
      }
      if (relativeFile.startsWith("packages/ui/") && importPath === "@codex-remote/api-contract") {
        violations.push({
          file: relativeFile,
          importPath,
          rule: "packages/ui must remain domain-free",
        });
      }
      if (relativeFile.startsWith("packages/api-contract/") && importPath === "@codex-remote/codex-protocol") {
        violations.push({
          file: relativeFile,
          importPath,
          rule: "api-contract must not depend on upstream app-server protocol",
        });
      }
    }
  }

  return violations;
}

test("when enforcing package boundaries, app and shared packages should not import forbidden contracts", () => {
  assert.deepEqual(findViolations(), []);
});
