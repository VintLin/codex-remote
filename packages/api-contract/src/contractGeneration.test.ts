import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const packageRoot = new URL("../", import.meta.url);
const openApiPath = new URL("openapi.yaml", packageRoot);
const generatedPath = new URL("generated/openapi.ts", import.meta.url);
const sourceRootPath = new URL(".", import.meta.url).pathname;
const generatedRootPath = new URL("generated/", import.meta.url).pathname;
const schemaTypeNames = [
  "DeviceConnectionStatus",
  "ConversationStatus",
  "TaskStatus",
  "DiffKind",
  "Device",
  "RemoteProject",
  "CodexConversation",
  "BoardTask",
  "DiffLine",
  "ConversationInputItem",
  "FollowUpInput",
  "CommandAccepted",
  "ErrorEnvelope",
  "AppServerTransport",
  "WorkerConnectionStatus",
  "WorkerHealth",
  "WorkerCapabilities",
  "ConversationRuntimeStatus",
  "LatestTurnStatus",
  "TurnStatus",
  "TimelineItemsView",
  "TimelineSortDirection",
  "ConversationTimelineTurn",
  "ConversationTimeline",
  "ConversationTimelinePage",
  "ConversationEvent",
  "ProbeFailureType",
  "ProbeCheckResult",
  "ProbeMode",
  "WorkerProbeSummary",
] as const;
const schemaTypeNamePattern = schemaTypeNames.join("|");

function collectTypeScriptSourceFiles(directoryPath: string): string[] {
  const entries = readdirSync(directoryPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = join(directoryPath, entry.name);
    if (entryPath.startsWith(generatedRootPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...collectTypeScriptSourceFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }

  return files;
}

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

test("when public api types are exported, source files should not redeclare schema fields", () => {
  const sourceFiles = collectTypeScriptSourceFiles(sourceRootPath);
  const forbiddenDefinitions = sourceFiles.flatMap((sourceFilePath) => {
    const source = readFileSync(sourceFilePath, "utf8");
    const sourceLines = source.split("\n");

    return sourceLines.flatMap((line, index) => {
      const trimmedLine = line.trim();
      const definesInterface = new RegExp(`^(export\\s+)?interface\\s+(${schemaTypeNamePattern})\\b`).test(
        trimmedLine,
      );
      const typeAliasMatch = new RegExp(`^(export\\s+)?type\\s+(${schemaTypeNamePattern})\\s*=`).exec(trimmedLine);
      const definesGeneratedAlias = /components\["schemas"\]\["[A-Za-z]+"\]/.test(trimmedLine);
      const definesLocalTypeAlias = Boolean(typeAliasMatch) && !definesGeneratedAlias;

      if (!definesInterface && !definesLocalTypeAlias) {
        return [];
      }

      const relativePath = relative(sourceRootPath, sourceFilePath);
      return `${relativePath}:${index + 1}: ${trimmedLine}`;
    });
  });

  assert.deepEqual(forbiddenDefinitions, []);
  const publicExportSource = readFileSync(new URL("index.ts", import.meta.url), "utf8");
  assert.match(publicExportSource, /from "\.\/generated\/openapi"/);
});

test("when read-only main-chain schemas are maintained, openapi should define the field floor", () => {
  const source = readFileSync(openApiPath, "utf8");

  for (const schemaName of [
    "WorkerHealth:",
    "WorkerCapabilities:",
    "ConversationTimeline:",
    "ConversationTimelinePage:",
    "ConversationEvent:",
    "WorkerProbeSummary:",
    "ProbeCheckResult:",
  ]) {
    assert.match(source, new RegExp(`^    ${schemaName}`, "m"));
  }

  for (const fieldName of [
    "deviceId:",
    "conversationId:",
    "readStartedAt:",
    "readCompletedAt:",
    "snapshotRevision:",
    "runtimeStatus:",
    "latestTurnStatus:",
    "nextCursor:",
    "backwardsCursor:",
    "eventId:",
    "upstreamMethod:",
    "connectionId:",
    "sequence:",
    "checks:",
  ]) {
    assert.match(source, new RegExp(`^        ${fieldName}`, "m"));
  }
});

test("when worker read-only http api is maintained, openapi should define versioned stage 2 paths", () => {
  const source = readFileSync(openApiPath, "utf8");

  for (const path of [
    "/v1/worker/health:",
    "/v1/worker/capabilities:",
    "/v1/worker/probe:",
    "/v1/conversations:",
    "/v1/conversations/{conversationId}/timeline:",
  ]) {
    assert.match(source, new RegExp(`^  ${path.replaceAll("/", "\\/")}`, "m"));
  }
});

test("when worker read-only http api errors are maintained, routes should use ErrorEnvelope", () => {
  const source = readFileSync(openApiPath, "utf8");

  for (const status of ['"400"', '"401"', '"403"', '"408"', '"424"', '"500"']) {
    assert.match(source, new RegExp(`${status}:[\\s\\S]*\\$ref: "#\\/components\\/schemas\\/ErrorEnvelope"`));
  }
});

test("when stage 2 worker routes are implemented, write routes should stay outside the allowlist", () => {
  const source = readFileSync(openApiPath, "utf8");

  assert.doesNotMatch(source, /operationId:\s*workerFollowUpConversation/);
  assert.doesNotMatch(source, /operationId:\s*workerApproval/);
  assert.doesNotMatch(source, /operationId:\s*workerInterrupt/);
  assert.doesNotMatch(source, /operationId:\s*workerSteer/);
});

test("when ErrorEnvelope is maintained, details must be allowlisted", () => {
  const source = readFileSync(openApiPath, "utf8");

  const allowlistedDetailsField = [
    /\bdetails:/,
    /^\s{4}type:\s*object/m,
    /^\s{6}oneOf:/m,
    /^\s{8}-\s+\$ref: '#\/components\/schemas\/ProbeFailure'/m,
    /^\s{8}-\s+\$ref: '#\/components\/schemas\/CommandNotAllowedError'/m,
    /^\s{8}-\s+\$ref: '#\/components\/schemas\/ConversationNotFoundError'/m,
  ];

  for (const pattern of allowlistedDetailsField) {
    assert.match(source, pattern);
  }
});
