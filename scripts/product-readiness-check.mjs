#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";

const defaultRoot = process.cwd();

export function runProductReadinessCheck(root = defaultRoot) {
  const failures = [
    ...checkRootScripts(root),
    ...checkLoopbackDefaults(root),
    ...checkOpenApi(root),
    ...checkImports(root),
    ...checkSensitiveShapes(root),
  ];

  return failures;
}

function readText(root, path) {
  return readFileSync(join(root, path), "utf8");
}

function readJson(root, path) {
  return JSON.parse(readText(root, path));
}

function checkRootScripts(root) {
  const packageJson = readJson(root, "package.json");
  const scripts = packageJson.scripts ?? {};
  const requiredScripts = ["web:start", "web:status", "web:stop", "lint", "typecheck", "test", "build", "product:check"];
  const packageScriptChecks = [
    ["apps/web/package.json", ["dev", "start", "build", "typecheck", "test", "lint"]],
    ["apps/control-plane/package.json", ["serve", "build", "typecheck", "test", "lint"]],
    ["apps/worker/package.json", ["serve:read", "probe:read", "build", "typecheck", "test", "lint"]],
    ["packages/api-contract/package.json", ["generate", "build", "typecheck", "test", "lint"]],
    ["packages/codex-protocol/package.json", ["build", "typecheck", "test", "lint"]],
    ["packages/db/package.json", ["generate", "build", "typecheck", "test", "lint"]],
    ["packages/ui/package.json", ["build", "typecheck", "test", "lint"]],
  ];
  return [
    ...requiredScripts.flatMap((script) => (typeof scripts[script] === "string" ? [] : [`package.json missing script ${script}`])),
    ...packageScriptChecks.flatMap(([path, requiredPackageScripts]) => {
      const packageScripts = readJson(root, path).scripts ?? {};
      return requiredPackageScripts.flatMap((script) =>
        typeof packageScripts[script] === "string" ? [] : [`${path} missing script ${script}`],
      );
    }),
  ];
}

function checkLoopbackDefaults(root) {
  const checks = [
    ["apps/web/package.json", /next dev --hostname 127\.0\.0\.1 --port 5173/],
    ["apps/web/package.json", /next start --hostname 127\.0\.0\.1 --port 5173/],
    ["apps/worker/src/http/workerHttpConfig.ts", /return "127\.0\.0\.1";/],
    ["apps/control-plane/src/config/controlPlaneConfig.ts", /return "127\.0\.0\.1";/],
    ["apps/control-plane/src/config/controlPlaneConfig.ts", /readLoopbackHttpUrl/],
    ["apps/worker/src/http/workerHttpConfig.ts", /assertLoopbackWebSocketUrl/],
  ];

  return checks.flatMap(([path, pattern]) => (pattern.test(readText(root, path)) ? [] : [`${path} missing loopback readiness guard`]));
}

function checkOpenApi(root) {
  const source = readText(root, "packages/api-contract/openapi.yaml");
  return [...checkOperationIds(source), ...checkClosedSchemas(source)];
}

function checkOperationIds(source) {
  const failures = [];
  for (const { path, method, lines } of openApiOperations(source)) {
    const isVersioned = path.startsWith("/v1/");
    if (isVersioned && !lines.some((line) => /^ {6}operationId:\s*\S+\s*$/.test(line))) {
      failures.push(`packages/api-contract/openapi.yaml ${method.toUpperCase()} ${path} missing operationId`);
    }
  }
  return failures;
}

function checkClosedSchemas(source) {
  const failures = [];
  const schemasBlock = blockLines(source.split("\n"), /^  schemas:\s*$/);
  const schemaHeaderPattern = /^ {4}([A-Za-z0-9_-]+):\s*$/;
  const headers = schemasBlock
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => schemaHeaderPattern.test(line));

  for (let i = 0; i < headers.length; i += 1) {
    const header = headers[i];
    const next = headers[i + 1]?.index ?? schemasBlock.length;
    const schemaName = header.line.match(schemaHeaderPattern)?.[1] ?? "unknown";
    const schemaLines = schemasBlock.slice(header.index, next);
    if (schemaLines.some((line) => /^ {6}type:\s*object\s*$/.test(line)) && !schemaLines.some((line) => /^ {6}additionalProperties:\s*false\s*$/.test(line))) {
      failures.push(`packages/api-contract/openapi.yaml schema ${schemaName} missing additionalProperties false`);
    }
  }
  return failures;
}

function openApiOperations(source) {
  const lines = source.split("\n");
  const operations = [];
  let currentPath = "";
  for (let i = 0; i < lines.length; i += 1) {
    const pathMatch = lines[i].match(/^  (\/[^:]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }

    const methodMatch = lines[i].match(/^ {4}(get|post|put|patch|delete):\s*$/);
    if (!methodMatch || !currentPath) {
      continue;
    }

    const startIndent = indentOf(lines[i]);
    let end = i + 1;
    while (end < lines.length && (lines[end].trim() === "" || indentOf(lines[end]) > startIndent)) {
      end += 1;
    }
    operations.push({ path: currentPath, method: methodMatch[1], lines: lines.slice(i, end) });
  }
  return operations;
}

function checkImports(root) {
  const failures = [];
  const sourceFiles = listFiles(root, ["apps", "packages"], [".ts", ".tsx"]);
  for (const file of sourceFiles) {
    const source = readText(root, file);
    const imports = [
      ...source.matchAll(/from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g),
    ].map((match) => match[1] ?? match[2] ?? match[3]);

    if (file.startsWith("apps/web/") && imports.some((specifier) => isWebForbiddenImport(root, file, specifier))) {
      failures.push(`${file} imports forbidden product boundary`);
    }
    if (file.startsWith("apps/control-plane/") && imports.some((specifier) => isControlPlaneForbiddenImport(root, file, specifier))) {
      failures.push(`${file} imports forbidden Worker/protocol boundary`);
    }
    if (!file.startsWith("apps/worker/") && imports.some((specifier) => specifier.includes("codex-protocol"))) {
      failures.push(`${file} imports app-server protocol outside Worker`);
    }
  }
  return failures;
}

function isWebForbiddenImport(root, file, specifier) {
  return (
    specifier.includes("codex-protocol") ||
    specifier.includes("@codex-remote/db") ||
    resolvesInside(root, file, specifier, "packages/db") ||
    resolvesInside(root, file, specifier, "packages/codex-protocol")
  );
}

function isControlPlaneForbiddenImport(root, file, specifier) {
  return (
    specifier.includes("codex-protocol") ||
    specifier.includes("@codex-remote/worker") ||
    specifier.includes("apps/worker") ||
    resolvesInside(root, file, specifier, "apps/worker") ||
    resolvesInside(root, file, specifier, "packages/codex-protocol")
  );
}

function resolvesInside(root, file, specifier, targetDir) {
  if (!specifier.startsWith(".")) {
    return false;
  }

  const resolved = resolve(root, dirname(file), specifier);
  return resolved === join(root, targetDir) || resolved.startsWith(`${join(root, targetDir)}/`);
}

function checkSensitiveShapes(root) {
  const allowedPlaceholders = new Set(["REDACTED", "example-token"]);
  const packageJsonFiles = ["package.json", ...listFiles(root, ["apps", "packages"], ["package.json"])];
  const scannedFiles = [
    ...["AGENTS.md", "PLAN.md", "PRODUCT.md", "PROJECT_STRUCTURE.md", "DESIGN.md"].filter((file) => existsSync(join(root, file))),
    ...packageJsonFiles,
    ...listFiles(root, ["docs/superpowers", "scripts"], [".md", ".mjs", ".sh"]).filter((file) => !file.endsWith(".test.mjs")),
    ...listFiles(root, ["docs/references"], [".md"]).filter(
      (file) =>
        file === "docs/references/README.md" ||
        file === "docs/references/local-self-hosting.md" ||
        file.includes("/product-readiness-fixtures/"),
    ),
  ];
  const patterns = [
    /\bsk-[A-Za-z0-9_-]{12,}\b/g,
    /\b(?:Bearer|token=)([A-Za-z0-9._-]{12,})\b/g,
    /\b[A-Z0-9_]*TOKEN[A-Z0-9_]*\s*=\s*["']?([A-Za-z0-9._-]{12,})["']?/g,
    /["'](?:token|publicToken|workerToken|controlPlaneToken|bearerToken)["']\s*:\s*["']([A-Za-z0-9._-]{12,})["']/gi,
    /\b--(?:token|bearer-token|worker-token|control-plane-token)\s+([A-Za-z0-9._-]{12,})\b/g,
    /https?:\/\/[^/\s:@]+:[^/\s@]+@/g,
    /\/Users\/[A-Za-z0-9._-]+\/[^\s)`'"]+/g,
    /^ {2,}at .+\(.+:\d+:\d+\)$/gm,
  ];

  const failures = [];
  for (const file of scannedFiles) {
    const source = readText(root, file);
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const matched = match[1] ?? match[0];
        if (!allowedPlaceholders.has(matched)) {
          failures.push(`${file} contains sensitive-shaped value`);
          break;
        }
      }
    }
  }
  return [...new Set(failures)];
}

function listFiles(root, dirs, extensions) {
  const files = [];
  for (const dir of dirs) {
    walk(join(root, dir), files, extensions, root);
  }
  return files.sort();
}

function walk(absPath, files, extensions, root) {
  if (!existsSync(absPath)) {
    return;
  }

  const stat = statSync(absPath);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(absPath)) {
      if (entry === "node_modules" || entry === ".next" || entry === "dist") {
        continue;
      }
      walk(join(absPath, entry), files, extensions, root);
    }
    return;
  }

  if (extensions.some((extension) => absPath.endsWith(extension))) {
    files.push(relative(root, absPath));
  }
}

function blockLines(lines, startPattern) {
  const start = lines.findIndex((line) => startPattern.test(line));
  if (start === -1) {
    return [];
  }
  const startIndent = indentOf(lines[start]);
  let end = start + 1;
  while (end < lines.length && (lines[end].trim() === "" || indentOf(lines[end]) > startIndent)) {
    end += 1;
  }
  return lines.slice(start, end);
}

function indentOf(line) {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const failures = runProductReadinessCheck(defaultRoot);
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`product readiness failed: ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Product readiness checks passed.");
  }
}
