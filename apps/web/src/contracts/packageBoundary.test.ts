import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

interface ImportViolation {
  file: string;
  importPath: string;
  rule: string;
}

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface BoundaryRule {
  forbiddenPackage: string;
  ownerPathPrefix: string;
  rule: string;
}

const boundaryRules: BoundaryRule[] = [
  {
    forbiddenPackage: "@codex-remote/codex-protocol",
    ownerPathPrefix: "apps/web/",
    rule: "apps/web must not import codex-protocol",
  },
  {
    forbiddenPackage: "@codex-remote/codex-protocol",
    ownerPathPrefix: "apps/control-plane/",
    rule: "apps/control-plane must not import codex-protocol",
  },
  {
    forbiddenPackage: "@codex-remote/api-contract",
    ownerPathPrefix: "packages/ui/",
    rule: "packages/ui must remain domain-free",
  },
  {
    forbiddenPackage: "@codex-remote/codex-protocol",
    ownerPathPrefix: "packages/api-contract/",
    rule: "api-contract must not depend on upstream app-server protocol",
  },
];

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

function findViolations(): ImportViolation[] {
  const workspaceRoot = new URL("../../../../", import.meta.url).pathname;
  const sourceRoots = [
    join(workspaceRoot, "apps/web/src"),
    join(workspaceRoot, "apps/control-plane/src"),
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
      for (const rule of boundaryRules) {
        if (!relativeFile.startsWith(rule.ownerPathPrefix) || !matchesPackage(importPath, rule.forbiddenPackage)) {
          continue;
        }
        violations.push({
          file: relativeFile,
          importPath,
          rule: rule.rule,
        });
      }
    }
  }

  violations.push(...findPackageManifestViolations(workspaceRoot));

  return violations;
}

function findPackageManifestViolations(workspaceRoot: string): ImportViolation[] {
  const packageJsonPaths = [
    "apps/web/package.json",
    "apps/control-plane/package.json",
    "packages/ui/package.json",
    "packages/api-contract/package.json",
  ];
  const violations: ImportViolation[] = [];

  for (const packageJsonPath of packageJsonPaths) {
    const manifest = readJsonFile<PackageManifest>(join(workspaceRoot, packageJsonPath));
    if (!manifest) {
      continue;
    }
    const dependencyNames = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);

    for (const dependencyName of dependencyNames) {
      for (const rule of boundaryRules) {
        if (!packageJsonPath.startsWith(rule.ownerPathPrefix) || dependencyName !== rule.forbiddenPackage) {
          continue;
        }
        violations.push({
          file: packageJsonPath,
          importPath: dependencyName,
          rule: rule.rule,
        });
      }
    }
  }

  return violations;
}

function readJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function matchesPackage(importPath: string, packageName: string): boolean {
  return importPath === packageName || importPath.startsWith(`${packageName}/`);
}

test("when enforcing package boundaries, app and shared packages should not import forbidden contracts", () => {
  assert.deepEqual(findViolations(), []);
});

test("when reading imports, should catch subpath dynamic and side-effect package imports", () => {
  const apiContractPackage = "@codex-remote/api-contract";
  const codexProtocolPackage = "@codex-remote/codex-protocol";
  const fromKeyword = "from";

  assert.deepEqual(
    importedPackages(`
      import type { Foo } ${fromKeyword} "${codexProtocolPackage}/v2";
      import "${apiContractPackage}/setup";
      const mod = import("${codexProtocolPackage}");
    `).sort(),
    [
      "@codex-remote/api-contract/setup",
      "@codex-remote/codex-protocol",
      "@codex-remote/codex-protocol/v2",
    ],
  );
  assert.equal(matchesPackage("@codex-remote/codex-protocol/v2", "@codex-remote/codex-protocol"), true);
});
