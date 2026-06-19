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
const stage2Paths = [
  "/v1/worker/health:",
  "/v1/worker/capabilities:",
  "/v1/worker/probe:",
  "/v1/conversations:",
  "/v1/conversations/{conversationId}/timeline:",
] as const;
const timelinePath = "/v1/conversations/{conversationId}/timeline:" as const;
const stage2ErrorStatuses = ["400", "401", "403", "408", "424", "500"] as const;
const stage2DisallowedMethods = ["post", "put", "patch", "delete", "head", "options", "trace"];
const stage2DisallowedOperationIds = ["approval", "stream", "interrupt", "steer", "followUpConversation"];

function indentOf(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function escapeRegExp(patternText: string): string {
  return patternText.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractBlockLines(source: string, startLinePattern: RegExp): string[] {
  const lines = source.split("\n");
  const startIndex = lines.findIndex((line) => startLinePattern.test(line));
  if (startIndex === -1) {
    return [];
  }

  const startIndent = indentOf(lines[startIndex]);
  let endIndex = startIndex + 1;

  while (endIndex < lines.length) {
    const currentLine = lines[endIndex];
    if (currentLine.trim() !== "" && indentOf(currentLine) <= startIndent) {
      break;
    }
    endIndex += 1;
  }

  return lines.slice(startIndex, endIndex);
}

function extractPathBlock(source: string, pathLine: string): string[] {
  return extractBlockLines(source, new RegExp(`^  ${escapeRegExp(pathLine)}$`));
}

type MethodBlock = { method: string; lines: string[] };

function extractMethodBlocks(pathBlockLines: string[]): MethodBlock[] {
  const methods: MethodBlock[] = [];
  const methodHeaderPattern = /^ {4}(get|post|put|patch|delete|head|options|trace):\s*$/;
  const methodHeaderIndices: number[] = [];
  for (let i = 0; i < pathBlockLines.length; i += 1) {
    if (methodHeaderPattern.test(pathBlockLines[i])) {
      methodHeaderIndices.push(i);
    }
  }

  for (let i = 0; i < methodHeaderIndices.length; i += 1) {
    const methodLineIndex = methodHeaderIndices[i];
    const methodMatch = methodHeaderPattern.exec(pathBlockLines[methodLineIndex]);
    if (!methodMatch) {
      continue;
    }
    const method = methodMatch[1];
    const sliceEnd = i + 1 < methodHeaderIndices.length ? methodHeaderIndices[i + 1] : pathBlockLines.length;
    methods.push({
      method,
      lines: pathBlockLines.slice(methodLineIndex, sliceEnd),
    });
  }

  return methods;
}

function extractResponseRefs(methodLines: string[]): Map<string, { hasDirectSchemaRef: boolean; componentResponseRefs: string[] }> {
  const responsesLineIndex = methodLines.findIndex((line) => /^ {6}responses:\s*$/.test(line));
  const responseInfo = new Map<string, { hasDirectSchemaRef: boolean; componentResponseRefs: string[] }>();
  if (responsesLineIndex === -1) {
    return responseInfo;
  }

  for (let i = responsesLineIndex + 1; i < methodLines.length; i += 1) {
    const statusLine = methodLines[i];
    const statusMatch = statusLine.match(/^ {8}"(\d{3})":\s*$/);
    if (!statusMatch) {
      continue;
    }

    const status = statusMatch[1];
    let statusBlockEnd = i + 1;
    while (statusBlockEnd < methodLines.length) {
      const blockLine = methodLines[statusBlockEnd];
      const blockIndent = indentOf(blockLine);
      if (blockLine.trim() === "") {
        statusBlockEnd += 1;
        continue;
      }
      if (blockIndent <= 8 || /^ {8}"\d{3}":\s*$/.test(blockLine)) {
        break;
      }
      statusBlockEnd += 1;
    }

    const statusLines = methodLines.slice(i + 1, statusBlockEnd).join("\n");
    const hasDirectSchemaRef =
      /^\s*\$ref:\s*["']#\/components\/schemas\/ErrorEnvelope["']$/m.test(statusLines);

    const componentResponseRefs = [
      ...statusLines.matchAll(/#\/components\/responses\/([A-Za-z0-9_-]+)/g),
    ].map((match) => match[1]);

    responseInfo.set(status, {
      hasDirectSchemaRef,
      componentResponseRefs,
    });

    i = statusBlockEnd - 1;
  }

  return responseInfo;
}

function getComponentResponseUsesErrorEnvelope(source: string): Map<string, boolean> {
  const componentsBlock = extractBlockLines(source, /^components:$/);
  const responsesBlock = extractBlockLines(componentsBlock.join("\n"), /^  responses:$/);
  const responseDefs = new Map<string, boolean>();

  if (responsesBlock.length === 0) {
    return responseDefs;
  }

  const responseHeaderPattern = /^ {4}([A-Za-z0-9_-]+):\s*$/;
  const responseHeaderIndices: number[] = [];
  for (let i = 0; i < responsesBlock.length; i += 1) {
    if (responseHeaderPattern.test(responsesBlock[i])) {
      responseHeaderIndices.push(i);
    }
  }

  for (let i = 0; i < responseHeaderIndices.length; i += 1) {
    const responseHeaderIndex = responseHeaderIndices[i];
    const responseNameMatch = responseHeaderPattern.exec(responsesBlock[responseHeaderIndex]);
    if (!responseNameMatch) {
      continue;
    }
    const responseName = responseNameMatch[1];
    const responseNext = i + 1 < responseHeaderIndices.length ? responseHeaderIndices[i + 1] : responsesBlock.length;
    const responseBody = responsesBlock.slice(responseHeaderIndex + 1, responseNext).join("\n");
    const usesErrorEnvelope = /^\s*\$ref:\s*["']#\/components\/schemas\/ErrorEnvelope["']$/m.test(responseBody);
    responseDefs.set(responseName, usesErrorEnvelope);
  }

  return responseDefs;
}

function extractVersionedPathLines(source: string): string[] {
  const lines = source.split("\n");
  const pathsStart = lines.findIndex((line) => /^paths:$/i.test(line));
  if (pathsStart === -1) {
    return [];
  }

  let i = pathsStart + 1;
  const paths: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const indent = indentOf(line);
    if (indent === 0) {
      break;
    }

    const versionedPathMatch = line.match(/^  (\/v1\/.*):$/);
    if (versionedPathMatch) {
      paths.push(`${versionedPathMatch[1]}:`);
    }

    i += 1;
  }

  return paths;
}

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
  const versionedPathLines = extractVersionedPathLines(source);
  const expectedVersionedPaths = [...stage2Paths];

  assert.deepEqual(versionedPathLines.sort(), expectedVersionedPaths.sort());

  for (const path of stage2Paths) {
    const pathBlockLines = extractPathBlock(source, path);
    assert.equal(pathBlockLines.length > 0, true);
    const methods = extractMethodBlocks(pathBlockLines);
    const methodNames = methods.map((methodBlock) => methodBlock.method);
    const disallowedMethodUsages = methodNames.filter((methodName) => stage2DisallowedMethods.includes(methodName));
    assert.deepEqual(disallowedMethodUsages, []);
    assert.deepEqual(methodNames.filter((methodName) => methodName !== "get"), []);
    assert.equal(methodNames.includes("get"), true);

    const methodLines = methods.flatMap((methodBlock) => methodBlock.lines);
    for (const methodLine of methodLines) {
      const operationMatch = methodLine.match(/^\s{6}operationId:\s*(\S+)$/);
      if (!operationMatch) {
        continue;
      }
      const operationId = operationMatch[1];
      assert.ok(
        !stage2DisallowedOperationIds.some((disallowedOperationId) =>
          operationId.toLowerCase().includes(disallowedOperationId.toLowerCase()),
        ),
      );
    }
  }
});

test("when worker read-only http api errors are maintained, stage 2 routes should use ErrorEnvelope", () => {
  const source = readFileSync(openApiPath, "utf8");
  const componentResponseDefs = getComponentResponseUsesErrorEnvelope(source);

  for (const path of stage2Paths) {
    const pathBlockLines = extractPathBlock(source, path);
    const methodBlocks = extractMethodBlocks(pathBlockLines);
    assert.equal(methodBlocks.length > 0, true);

    for (const method of methodBlocks) {
      const responseRefs = extractResponseRefs(method.lines);
      for (const status of stage2ErrorStatuses) {
        const responseInfo = responseRefs.get(status);
        assert.equal(typeof responseInfo, "object");
        const responseRefsErrorEnvelope = responseInfo
          ? responseInfo.componentResponseRefs.some((responseName) => componentResponseDefs.get(responseName) === true)
          : false;
        assert.equal(responseInfo?.hasDirectSchemaRef || responseRefsErrorEnvelope, true);
      }
    }
  }
});

test("when conversation timeline errors are maintained, only the timeline route should require 404 ErrorEnvelope", () => {
  const source = readFileSync(openApiPath, "utf8");
  const componentResponseDefs = getComponentResponseUsesErrorEnvelope(source);

  for (const path of stage2Paths) {
    const pathBlockLines = extractPathBlock(source, path);
    const methodBlocks = extractMethodBlocks(pathBlockLines);
    assert.equal(methodBlocks.length > 0, true);

    for (const method of methodBlocks) {
      const responseRefs = extractResponseRefs(method.lines);
      const responseInfo = responseRefs.get("404");
      const responseRefsErrorEnvelope = responseInfo
        ? responseInfo.componentResponseRefs.some((responseName) => componentResponseDefs.get(responseName) === true)
        : false;
      const has404ErrorEnvelope = responseInfo?.hasDirectSchemaRef || responseRefsErrorEnvelope;

      if (path === timelinePath) {
        assert.equal(has404ErrorEnvelope, true);
        continue;
      }

      assert.equal(has404ErrorEnvelope ?? false, false);
    }
  }
});

test("when ErrorEnvelope is maintained, details must be allowlisted", () => {
  const source = readFileSync(openApiPath, "utf8");
  const errorEnvelopeBlock = extractBlockLines(source, /^    ErrorEnvelope:$/);
  assert.equal(errorEnvelopeBlock.length > 0, true);

  const detailsBlockStart = errorEnvelopeBlock.findIndex((line) => /^ {8}details:\s*$/.test(line));
  assert.equal(detailsBlockStart >= 0, true);
  const detailsIndent = 8;
  let detailsBlockEnd = errorEnvelopeBlock.length;
  for (let i = detailsBlockStart + 1; i < errorEnvelopeBlock.length; i += 1) {
    if (errorEnvelopeBlock[i].trim() === "") {
      continue;
    }
    if (indentOf(errorEnvelopeBlock[i]) <= detailsIndent) {
      detailsBlockEnd = i;
      break;
    }
  }

  const detailsBlock = errorEnvelopeBlock.slice(detailsBlockStart, detailsBlockEnd).join("\n");
  const additionalPropertiesIsFalse = /^ {10}additionalProperties:\s*false$/m;
  const propertiesBlock = extractBlockLines(detailsBlock, /^ {10}properties:\s*$/).join("\n");
  const allowlistedKeys = ["operation", "retryable", "diagnosticId", "reason", "field", "limit"];
  const propertyKeys = [
    ...propertiesBlock.matchAll(/^ {12}([A-Za-z][A-Za-z0-9_-]*):\s*$/gm),
  ].map((match) => match[1]);

  assert.equal(additionalPropertiesIsFalse.test(detailsBlock), true);
  assert.deepEqual(new Set(propertyKeys), new Set(allowlistedKeys));
});
