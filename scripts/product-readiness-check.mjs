#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const defaultRoot = process.cwd();

export function runProductReadinessCheck(root = defaultRoot) {
  const failures = [
    ...checkRootScripts(root),
    ...checkRealLocalStackScripts(root),
    ...checkGitignore(root),
    ...checkRealCheckSafety(root),
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
  const requiredScripts = [
    "web:start",
    "web:status",
    "web:stop",
    "real:start",
    "real:status",
    "real:stop",
    "real:check",
    "web:e2e:smoke",
    "lint",
    "typecheck",
    "test",
    "build",
    "product:check",
  ];
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

function checkRealLocalStackScripts(root) {
  const scriptPaths = [
    "scripts/start-real-local-stack.sh",
    "scripts/status-real-local-stack.sh",
    "scripts/stop-real-local-stack.sh",
  ];
  const failures = [];

  for (const path of scriptPaths) {
    if (!existsSync(join(root, path))) {
      failures.push(`${path} missing`);
      continue;
    }
    const syntax = spawnSync("bash", ["-n", join(root, path)], { encoding: "utf8" });
    if (syntax.status !== 0) {
      failures.push(`${path} has invalid shell syntax`);
    }
  }

  if (failures.length > 0) {
    return failures;
  }

  const startSource = readText(root, "scripts/start-real-local-stack.sh");
  const statusSource = readText(root, "scripts/status-real-local-stack.sh");
  if (!/APP_SERVER_TRANSPORT="\$\{CODEX_REMOTE_APP_SERVER_TRANSPORT:-stdio\}"/.test(startSource)) {
    failures.push("scripts/start-real-local-stack.sh missing stdio transport default");
  }
  if (!/real:start using stdio/.test(startSource) || !/CODEX_REMOTE_START_APP_SERVER=true/.test(startSource)) {
    failures.push("scripts/start-real-local-stack.sh missing stdio startup path");
  }
  if (!/debug-websocket fallback/.test(startSource)) {
    failures.push("scripts/start-real-local-stack.sh missing debug fallback label");
  }
  if (/>"\$LOG_DIR\/\$name\.log" 2>&1/.test(startSource)) {
    failures.push("scripts/start-real-local-stack.sh redirects full service output to lifecycle logs");
  }
  if (
    !/start_new_session=True/.test(startSource) ||
    !/stdout=subprocess\.DEVNULL/.test(startSource) ||
    !/stderr=subprocess\.DEVNULL/.test(startSource) ||
    !/echo "\$started_pid" >"\$pid_file"/.test(startSource)
  ) {
    failures.push("scripts/start-real-local-stack.sh missing suppressed service output");
  }
  for (const envName of ["CODEX_REMOTE_WEB_PORT", "CODEX_REMOTE_CONTROL_PLANE_PORT", "CODEX_REMOTE_WORKER_PORT"]) {
    if (!statusSource.includes(envName)) {
      failures.push(`scripts/status-real-local-stack.sh missing ${envName} override`);
    }
  }
  return failures;
}

function checkGitignore(root) {
  const source = readText(root, ".gitignore");
  const requiredPatterns = ["logs/real-check/", "logs/*.log", "logs/*.pid", "logs/*.sqlite", "logs/*.sqlite-*"];
  return requiredPatterns.flatMap((pattern) => (source.split("\n").includes(pattern) ? [] : [`.gitignore missing ${pattern}`]));
}

function checkRealCheckSafety(root) {
  return [...checkRealCheckRunnerSource(root), ...checkWebSmokeSource(root), ...checkRealCheckLatestReport(root)];
}

function checkRealCheckRunnerSource(root) {
  const path = "scripts/real-local-calibration.mjs";
  if (!existsSync(join(root, path))) {
    return [`${path} missing`];
  }

  const source = readText(root, path);
  const unsafeReportKeys = [
    "rawRequestBody",
    "rawResponseBody",
    "rawPrompt",
    "rawId",
    "rawUrl",
    "rawJsonRpc",
    "commandOutput",
    "fullDiff",
    "privatePath",
    "stack",
    "cause",
  ];
  return unsafeReportKeys.flatMap((key) =>
    new RegExp(`\\b${key}\\b`, "i").test(source) ? [`${path} contains unsafe real-check report key ${key}`] : [],
  )
    .concat(source.includes("/worker/capabilities") ? [] : [`${path} missing worker capabilities proof`])
    .concat(source.includes("appServerTransport") ? [] : [`${path} missing WorkerCapabilities appServerTransport proof`])
    .concat(source.includes("no_control_plane_cwd_scope_probe") ? [] : [`${path} missing Q23 cwd-scope gap reason`])
    .concat(source.includes("no_control_plane_pagination_probe") ? [] : [`${path} missing Q23 pagination gap reason`])
    .concat(source.includes("no_all_workers_down_fixture") ? [] : [`${path} missing Q24 all-workers-down fixture gap reason`])
    .concat(source.includes("no_invalid_worker_token_fixture") ? [] : [`${path} missing Q24 invalid-worker-token fixture gap reason`])
    .concat(/conversationList\.length\s*>\s*0\s*\?\s*["']real-pass["']/.test(source) ? [`${path} contains weak Q23 conversation-count pass pattern`] : []);
}

function checkWebSmokeSource(root) {
  const path = "apps/web/e2e/real-local-smoke.spec.ts";
  if (!existsSync(join(root, path))) {
    return [`${path} missing`];
  }
  const source = readText(root, path);
  return /\btest\.skip\s*\(/.test(source) ? [`${path} contains test.skip`] : [];
}

function checkRealCheckLatestReport(root) {
  const reportPath = "logs/real-check/latest.json";
  const absolutePath = join(root, reportPath);
  if (!existsSync(absolutePath)) {
    return [];
  }

  let report;
  try {
    report = JSON.parse(readText(root, reportPath));
  } catch {
    return [`${reportPath} is not valid JSON`];
  }

  const failures = [];
  const rootKeys = new Set(["schemaVersion", "generatedAt", "summary", "checks"]);
  const checkKeys = new Set(["name", "status", "durationMs", "detail"]);
  const summaryKeys = new Set(["total", "realPass", "fixedPass", "realGap"]);
  const detailKeys = new Set([
    "status",
    "durationMs",
    "count",
    "turns",
    "sanitizedCode",
    "reasonCode",
    "transport",
    "appServerConnected",
    "codexVersion",
    "protocolGeneratedAt",
    "conversationRef",
    "turnRef",
    "taskRef",
    "pageCount",
    "cursorCount",
    "activeTurnProven",
  ]);
  const unsafeValuePatterns = [
    /\bsk-[A-Za-z0-9_-]{12,}\b/,
    /\bBearer\s+[A-Za-z0-9._-]{8,}\b/i,
    /https?:\/\/[^\s"'{}[\]]+/i,
    /\/Users\/[A-Za-z0-9._-]+\//,
    /^ {2,}at .+\(.+:\d+:\d+\)$/m,
    /\bcodex-remote-calibration\b/i,
    /\bjsonrpc\b/i,
    /\bdiff --git\b/i,
  ];

  for (const key of Object.keys(requireRecordForScan(report, failures, reportPath))) {
    if (!rootKeys.has(key)) {
      failures.push(`${reportPath} contains unsafe real-check key ${key}`);
    }
  }

  if (report.summary !== undefined) {
    for (const key of Object.keys(requireRecordForScan(report.summary, failures, reportPath))) {
      if (!summaryKeys.has(key)) {
        failures.push(`${reportPath} contains unsafe real-check key ${key}`);
      }
    }
  }

  if (Array.isArray(report.checks)) {
    const workerProof = report.checks.find((check) => check?.name === "worker app-server proof");
    const hasRealWorkerProof = hasRealWorkerProofDetail(workerProof);
    const workerProofGatedChecks = new Set(["start conversation", "follow-up", "interrupt", "steer", "approval decision", "task link"]);
    for (const check of report.checks) {
      const record = requireRecordForScan(check, failures, reportPath);
      for (const key of Object.keys(record)) {
        if (!checkKeys.has(key)) {
          failures.push(`${reportPath} contains unsafe real-check key ${key}`);
        }
      }
      if (!["real-pass", "fixed-pass", "real-gap"].includes(record.status)) {
        failures.push(`${reportPath} contains invalid real-check status`);
      }
      if (!hasRealWorkerProof && workerProofGatedChecks.has(record.name) && record.status === "real-pass") {
        failures.push(`${reportPath} contains real-pass ${record.name} without real worker proof`);
      }
      if (record.detail !== undefined) {
        const detail = requireRecordForScan(record.detail, failures, reportPath);
        for (const key of Object.keys(detail)) {
          if (!detailKeys.has(key)) {
            failures.push(`${reportPath} contains unsafe real-check key ${key}`);
          }
        }
        if (record.name === "steer" && record.status === "real-pass" && (detail.status !== 202 || detail.activeTurnProven !== true)) {
          failures.push(`${reportPath} contains real-pass steer without active turn proof`);
        }
      }
    }
  } else {
    failures.push(`${reportPath} missing checks array`);
  }

  const text = JSON.stringify(report);
  if (unsafeValuePatterns.some((pattern) => pattern.test(text))) {
    failures.push(`${reportPath} contains unsafe real-check value`);
  }

  return [...new Set(failures)];
}

function hasRealWorkerProofDetail(workerProof) {
  const detail = workerProof && typeof workerProof === "object" && !Array.isArray(workerProof) ? workerProof.detail : null;
  if (workerProof?.status !== "real-pass" || !detail || typeof detail !== "object" || Array.isArray(detail)) {
    return false;
  }
  return (
    detail.appServerConnected === true &&
    detail.transport === "stdio" &&
    typeof detail.codexVersion === "string" &&
    detail.codexVersion.length > 0
  );
}

function requireRecordForScan(value, failures, path) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  failures.push(`${path} contains non-object real-check record`);
  return {};
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
