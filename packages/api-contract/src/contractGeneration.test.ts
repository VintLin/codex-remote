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
  "TaskConversationLink",
  "DiffLine",
  "ConversationInputItem",
  "CreateTaskInput",
  "LinkTaskConversationInput",
  "StartConversationInput",
  "FollowUpInput",
  "InterruptTurnInput",
  "SteerTurnInput",
  "PendingApproval",
  "ApprovalDecisionInput",
  "ControlPlaneHealth",
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
const stage4WritePaths = ["/v1/conversations:", "/v1/conversations/{conversationId}/follow-up:"] as const;
const stage5ControlPaths = [
  "/v1/conversations/{conversationId}/turns/{turnId}/interrupt:",
  "/v1/conversations/{conversationId}/turns/{turnId}/steer:",
  "/v1/conversations/{conversationId}/approvals:",
  "/v1/conversations/{conversationId}/approvals/{approvalRequestId}/decision:",
] as const;
const stage5WriteControlPaths = [
  "/v1/conversations/{conversationId}/turns/{turnId}/interrupt:",
  "/v1/conversations/{conversationId}/turns/{turnId}/steer:",
  "/v1/conversations/{conversationId}/approvals/{approvalRequestId}/decision:",
] as const;
const stage6ControlPlanePaths = [
  "/v1/control-plane/health:",
  "/v1/devices:",
  "/v1/projects:",
  "/v1/conversations:",
  "/v1/devices/{deviceId}/projects:",
  "/v1/devices/{deviceId}/worker/health:",
  "/v1/devices/{deviceId}/worker/capabilities:",
  "/v1/devices/{deviceId}/conversations/{conversationId}/timeline:",
  "/v1/devices/{deviceId}/conversations/{conversationId}/approvals:",
  "/v1/devices/{deviceId}/conversations:",
  "/v1/devices/{deviceId}/conversations/{conversationId}/follow-up:",
  "/v1/devices/{deviceId}/conversations/{conversationId}/turns/{turnId}/interrupt:",
  "/v1/devices/{deviceId}/conversations/{conversationId}/turns/{turnId}/steer:",
  "/v1/devices/{deviceId}/conversations/{conversationId}/approvals/{approvalRequestId}/decision:",
] as const;
const stage6ControlPlaneWritePaths = [
  "/v1/devices/{deviceId}/conversations:",
  "/v1/devices/{deviceId}/conversations/{conversationId}/follow-up:",
  "/v1/devices/{deviceId}/conversations/{conversationId}/turns/{turnId}/interrupt:",
  "/v1/devices/{deviceId}/conversations/{conversationId}/turns/{turnId}/steer:",
  "/v1/devices/{deviceId}/conversations/{conversationId}/approvals/{approvalRequestId}/decision:",
] as const;
const stage7TaskPaths = [
  "/v1/tasks:",
  "/v1/tasks/{taskId}/conversation-links:",
  "/v1/tasks/{taskId}/conversation-links/{deviceId}/{conversationId}:",
] as const;
const stage7TaskWritePathMethodPairs = [
  "/v1/tasks:post",
  "/v1/tasks/{taskId}/conversation-links:post",
  "/v1/tasks/{taskId}/conversation-links/{deviceId}/{conversationId}:delete",
] as const;
const stage4WriteErrorStatuses = {
  "/v1/conversations:": ["400", "401", "403", "408", "409", "424", "500"],
  "/v1/conversations/{conversationId}/follow-up:": ["400", "401", "403", "404", "408", "409", "424", "500"],
} as const satisfies Record<(typeof stage4WritePaths)[number], readonly string[]>;
const stage5ControlErrorStatuses = {
  "/v1/conversations/{conversationId}/turns/{turnId}/interrupt:": [
    "400",
    "401",
    "403",
    "404",
    "408",
    "409",
    "424",
    "500",
  ],
  "/v1/conversations/{conversationId}/turns/{turnId}/steer:": [
    "400",
    "401",
    "403",
    "404",
    "408",
    "409",
    "424",
    "500",
  ],
  "/v1/conversations/{conversationId}/approvals:": ["400", "401", "403", "404", "408", "424", "500"],
  "/v1/conversations/{conversationId}/approvals/{approvalRequestId}/decision:": [
    "400",
    "401",
    "403",
    "404",
    "408",
    "409",
    "424",
    "500",
  ],
} as const satisfies Record<(typeof stage5ControlPaths)[number], readonly string[]>;
const writeMethods = ["post", "put", "patch", "delete"] as const;
const controlRequestSchemas = ["InterruptTurnInput", "SteerTurnInput", "ApprovalDecisionInput"] as const;

function indentOf(line: string): number {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

function escapeRegExp(patternText: string): string {
  return patternText.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expectDefined<T>(value: T | undefined, message: string): NonNullable<T> {
  assert.notEqual(value, undefined, message);
  return value as NonNullable<T>;
}

function expectCapturedGroup(match: RegExpMatchArray | RegExpExecArray | null, message: string): string {
  assert.notEqual(match, null, message);
  const matchedGroups = expectDefined(match, message);
  return expectDefined(matchedGroups[1], message);
}

function extractBlockLines(source: string, startLinePattern: RegExp): string[] {
  const lines = source.split("\n");
  const startIndex = lines.findIndex((line) => startLinePattern.test(line));
  if (startIndex === -1) {
    return [];
  }

  const startIndent = indentOf(expectDefined(lines[startIndex], "start line should exist"));
  let endIndex = startIndex + 1;

  while (endIndex < lines.length) {
    const currentLine = expectDefined(lines[endIndex], "block line should exist");
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

function extractSchemaBlock(source: string, schemaName: string): string[] {
  return extractBlockLines(source, new RegExp(`^    ${escapeRegExp(schemaName)}:$`));
}

function extractPropertyBlock(schemaBlockLines: string[], propertyName: string): string[] {
  return extractBlockLines(schemaBlockLines.join("\n"), new RegExp(`^        ${escapeRegExp(propertyName)}:$`));
}

function extractEnumValues(propertyBlockLines: string[]): string[] {
  const enumBlockLines = extractBlockLines(propertyBlockLines.join("\n"), /^          enum:\s*$/);
  return enumBlockLines.flatMap((line) => {
    const enumValueMatch = line.match(/^            - (.+)$/);
    return enumValueMatch ? [expectCapturedGroup(enumValueMatch, "enum value should exist")] : [];
  });
}

function expectSchemaDisallowsAdditionalProperties(source: string, schemaName: string): string[] {
  const schemaBlockLines = extractSchemaBlock(source, schemaName);
  assert.equal(schemaBlockLines.length > 0, true, `${schemaName} should exist`);
  assert.match(schemaBlockLines.join("\n"), /^      additionalProperties:\s*false$/m);
  return schemaBlockLines;
}

function expectPropertyMaxLength(schemaBlockLines: string[], propertyName: string, maxLength: number): void {
  const propertyBlockLines = extractPropertyBlock(schemaBlockLines, propertyName);
  assert.equal(propertyBlockLines.length > 0, true, `${propertyName} should exist`);
  assert.match(propertyBlockLines.join("\n"), new RegExp(`^          maxLength:\\s*${maxLength}$`, "m"));
}

function expectPropertyEnum(schemaBlockLines: string[], propertyName: string, expectedValues: readonly string[]): void {
  const propertyBlockLines = extractPropertyBlock(schemaBlockLines, propertyName);
  assert.equal(propertyBlockLines.length > 0, true, `${propertyName} should exist`);
  assert.deepEqual(new Set(extractEnumValues(propertyBlockLines)), new Set(expectedValues));
}

type MethodBlock = { method: string; lines: string[] };

function extractMethodBlocks(pathBlockLines: string[]): MethodBlock[] {
  const methods: MethodBlock[] = [];
  const methodHeaderPattern = /^ {4}(get|post|put|patch|delete|head|options|trace):\s*$/;
  const methodHeaderIndices: number[] = [];
  for (let i = 0; i < pathBlockLines.length; i += 1) {
    if (methodHeaderPattern.test(expectDefined(pathBlockLines[i], "method header line should exist"))) {
      methodHeaderIndices.push(i);
    }
  }

  for (let i = 0; i < methodHeaderIndices.length; i += 1) {
    const methodLineIndex = expectDefined(methodHeaderIndices[i], "method header index should exist");
    const methodMatch = methodHeaderPattern.exec(expectDefined(pathBlockLines[methodLineIndex], "method line should exist"));
    if (!methodMatch) {
      continue;
    }
    const method = expectCapturedGroup(methodMatch, "method capture should exist");
    const sliceEnd =
      i + 1 < methodHeaderIndices.length
        ? expectDefined(methodHeaderIndices[i + 1], "next method header index should exist")
        : pathBlockLines.length;
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
    const statusLine = expectDefined(methodLines[i], "status line should exist");
    const statusMatch = statusLine.match(/^ {8}"(\d{3})":\s*$/);
    if (!statusMatch) {
      continue;
    }

    const status = expectCapturedGroup(statusMatch, "status capture should exist");
    let statusBlockEnd = i + 1;
    while (statusBlockEnd < methodLines.length) {
      const blockLine = expectDefined(methodLines[statusBlockEnd], "status block line should exist");
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
    ].map((match) => expectDefined(match[1], "component response capture should exist"));

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
    if (responseHeaderPattern.test(expectDefined(responsesBlock[i], "response header line should exist"))) {
      responseHeaderIndices.push(i);
    }
  }

  for (let i = 0; i < responseHeaderIndices.length; i += 1) {
    const responseHeaderIndex = expectDefined(responseHeaderIndices[i], "response header index should exist");
    const responseNameMatch = responseHeaderPattern.exec(
      expectDefined(responsesBlock[responseHeaderIndex], "response header should exist"),
    );
    if (!responseNameMatch) {
      continue;
    }
    const responseName = expectCapturedGroup(responseNameMatch, "response name capture should exist");
    const responseNext =
      i + 1 < responseHeaderIndices.length
        ? expectDefined(responseHeaderIndices[i + 1], "next response header index should exist")
        : responsesBlock.length;
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
    const line = expectDefined(lines[i], "path line should exist");
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

function extractPathMethodPairs(source: string): string[] {
  const lines = source.split("\n");
  let currentPath: string | undefined;
  const pathMethodPairs: string[] = [];

  for (const line of lines) {
    const pathMatch = line.match(/^  (\/[^:]+):$/);
    if (pathMatch) {
      currentPath = expectCapturedGroup(pathMatch, "path capture should exist");
      continue;
    }

    if (!currentPath) {
      continue;
    }

    const methodMatch = line.match(/^ {4}(get|post|put|patch|delete|head|options|trace):\s*$/);
    if (!methodMatch) {
      continue;
    }

    const method = expectCapturedGroup(methodMatch, "method capture should exist");
    pathMethodPairs.push(`${currentPath}:${method}`);
  }

  return pathMethodPairs;
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
  assert.match(source, /StartConversationInput:/);
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

test("when public api operations are maintained, every versioned operation should have an operationId", () => {
  const source = readFileSync(openApiPath, "utf8");
  const missingOperationIds = extractVersionedPathLines(source).flatMap((path) => {
    const pathBlockLines = extractPathBlock(source, path);
    return extractMethodBlocks(pathBlockLines).flatMap((methodBlock) =>
      methodBlock.lines.some((line) => /^ {6}operationId:\s*\S+\s*$/.test(line))
        ? []
        : `${methodBlock.method.toUpperCase()} ${path.replace(/:$/, "")}`,
    );
  });

  assert.deepEqual(missingOperationIds, []);
});

test("contract generation: when product Web needs project discovery, should expose versioned project routes", () => {
  const source = readFileSync(openApiPath, "utf8");

  assert.match(source, /^  \/v1\/projects:\n {4}get:\n {6}operationId: listControlPlaneProjects/m);
  assert.match(source, /^  \/v1\/devices\/\{deviceId\}\/projects:\n {4}get:\n {6}operationId: listControlPlaneDeviceProjects/m);

  const controlPlaneProjectsPathBlockLines = extractPathBlock(source, "/v1/projects:");
  const controlPlaneProjectsGet = expectDefined(
    extractMethodBlocks(controlPlaneProjectsPathBlockLines).find((methodBlock) => methodBlock.method === "get"),
    "/v1/projects should define GET",
  );
  assert.deepEqual(extractResponseRefs(controlPlaneProjectsGet.lines).get("424")?.componentResponseRefs, [
    "DeviceUnavailableError",
  ]);
});

test("when public object schemas are maintained, component schemas should stay closed", () => {
  const source = readFileSync(openApiPath, "utf8");
  const schemasBlock = extractBlockLines(source, /^  schemas:\s*$/);
  const objectSchemaNames = schemasBlock.flatMap((line) => {
    const schemaMatch = line.match(/^ {4}([A-Za-z0-9_-]+):\s*$/);
    if (!schemaMatch) {
      return [];
    }

    const schemaName = expectCapturedGroup(schemaMatch, "schema name should exist");
    const schemaBlock = extractSchemaBlock(source, schemaName).join("\n");
    return /^ {6}type:\s*object\s*$/m.test(schemaBlock) ? [schemaName] : [];
  });
  const openObjectSchemas = objectSchemaNames.filter((schemaName) => {
    const schemaBlock = extractSchemaBlock(source, schemaName).join("\n");
    return !/^ {6}additionalProperties:\s*false\s*$/m.test(schemaBlock);
  });

  assert.deepEqual(openObjectSchemas, []);
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

  for (const path of stage2Paths) {
    assert.equal(versionedPathLines.includes(path), true);
  }

  for (const path of stage2Paths) {
    const pathBlockLines = extractPathBlock(source, path);
    assert.equal(pathBlockLines.length > 0, true);
    const methods = extractMethodBlocks(pathBlockLines);
    const methodNames = methods.map((methodBlock) => methodBlock.method);
    if (path !== "/v1/conversations:") {
      const disallowedMethodUsages = methodNames.filter((methodName) => stage2DisallowedMethods.includes(methodName));
      assert.deepEqual(disallowedMethodUsages, []);
      assert.deepEqual(methodNames.filter((methodName) => methodName !== "get"), []);
    }
    assert.equal(methodNames.includes("get"), true);

    const methodLines = methods.filter((methodBlock) => methodBlock.method === "get").flatMap((methodBlock) => methodBlock.lines);
    for (const methodLine of methodLines) {
      const operationMatch = methodLine.match(/^\s{6}operationId:\s*(\S+)$/);
      if (!operationMatch) {
        continue;
      }
      const operationId = expectCapturedGroup(operationMatch, "operationId capture should exist");
      assert.ok(
        !stage2DisallowedOperationIds.some((disallowedOperationId) =>
          operationId.toLowerCase().includes(disallowedOperationId.toLowerCase()),
        ),
      );
    }
  }
});

test("when worker write http api is maintained, openapi should define only versioned write paths", () => {
  const source = readFileSync(openApiPath, "utf8");
  const writePathMethodPairs = extractPathMethodPairs(source).filter((pathMethodPair) => {
    const method = expectDefined(pathMethodPair.split(":").at(-1), "method should exist");
    return writeMethods.some((writeMethod) => writeMethod === method);
  });
  const expectedWritePathMethodPairs = [
    ...[...stage4WritePaths, ...stage5WriteControlPaths, ...stage6ControlPlaneWritePaths].map(
      (path) => `${path.slice(0, -1)}:post`,
    ),
    ...stage7TaskWritePathMethodPairs,
  ];

  assert.deepEqual(writePathMethodPairs.sort(), expectedWritePathMethodPairs.sort());
  for (const pathMethodPair of writePathMethodPairs) {
    assert.match(pathMethodPair, /^\/v1\//);
  }

  const startPathBlockLines = extractPathBlock(source, "/v1/conversations:");
  const startMethod = expectDefined(
    extractMethodBlocks(startPathBlockLines).find((methodBlock) => methodBlock.method === "post"),
    "start write route should define POST",
  );
  const startMethodSource = startMethod.lines.join("\n");
  assert.match(startMethodSource, /^ {6}operationId:\s*startWorkerConversation$/m);
  assert.match(startMethodSource, /#\/components\/schemas\/StartConversationInput/);
  assert.match(startMethodSource, /#\/components\/schemas\/CommandAccepted/);

  const followUpPathBlockLines = extractPathBlock(source, "/v1/conversations/{conversationId}/follow-up:");
  const followUpMethod = expectDefined(
    extractMethodBlocks(followUpPathBlockLines).find((methodBlock) => methodBlock.method === "post"),
    "follow-up write route should define POST",
  );
  const followUpMethodSource = followUpMethod.lines.join("\n");
  assert.match(followUpMethodSource, /^ {6}operationId:\s*followUpWorkerConversation$/m);
  assert.match(followUpMethodSource, /#\/components\/schemas\/FollowUpInput/);
  assert.match(followUpMethodSource, /#\/components\/schemas\/CommandAccepted/);
});

test("when worker control http api is maintained, openapi should define versioned stage 5 control paths", () => {
  const source = readFileSync(openApiPath, "utf8");
  const versionedPathLines = extractVersionedPathLines(source);

  for (const path of stage5ControlPaths) {
    assert.equal(versionedPathLines.includes(path), true);
  }

  const expectedMethods = new Map<(typeof stage5ControlPaths)[number], "get" | "post">([
    ["/v1/conversations/{conversationId}/turns/{turnId}/interrupt:", "post"],
    ["/v1/conversations/{conversationId}/turns/{turnId}/steer:", "post"],
    ["/v1/conversations/{conversationId}/approvals:", "get"],
    ["/v1/conversations/{conversationId}/approvals/{approvalRequestId}/decision:", "post"],
  ]);

  for (const path of stage5ControlPaths) {
    const pathBlockLines = extractPathBlock(source, path);
    assert.equal(pathBlockLines.length > 0, true);
    const methodNames = extractMethodBlocks(pathBlockLines).map((methodBlock) => methodBlock.method);
    assert.equal(methodNames.includes(expectDefined(expectedMethods.get(path), `${path} should have an expected method`)), true);
  }
});

test("when worker control routes are maintained, no unversioned public control paths should exist", () => {
  const source = readFileSync(openApiPath, "utf8");
  const controlPathLines = source
    .split("\n")
    .filter((line) => /^  \/.+:\s*$/.test(line))
    .filter((line) => /approval|interrupt|steer/i.test(line));

  assert.equal(controlPathLines.length > 0, true);
  assert.deepEqual(
    controlPathLines.filter((line) => !/^  \/v1\//.test(line)),
    [],
  );
});

test("when control plane http api is maintained, openapi should define versioned stage 6 paths", () => {
  const source = readFileSync(openApiPath, "utf8");
  const versionedPathLines = extractVersionedPathLines(source);

  for (const path of stage6ControlPlanePaths) {
    assert.equal(versionedPathLines.includes(path), true);
  }

  const expectedMethods = new Map<(typeof stage6ControlPlanePaths)[number], "get" | "post">([
    ["/v1/control-plane/health:", "get"],
    ["/v1/devices:", "get"],
    ["/v1/projects:", "get"],
    ["/v1/conversations:", "get"],
    ["/v1/devices/{deviceId}/projects:", "get"],
    ["/v1/devices/{deviceId}/worker/health:", "get"],
    ["/v1/devices/{deviceId}/worker/capabilities:", "get"],
    ["/v1/devices/{deviceId}/conversations/{conversationId}/timeline:", "get"],
    ["/v1/devices/{deviceId}/conversations/{conversationId}/approvals:", "get"],
    ["/v1/devices/{deviceId}/conversations:", "post"],
    ["/v1/devices/{deviceId}/conversations/{conversationId}/follow-up:", "post"],
    ["/v1/devices/{deviceId}/conversations/{conversationId}/turns/{turnId}/interrupt:", "post"],
    ["/v1/devices/{deviceId}/conversations/{conversationId}/turns/{turnId}/steer:", "post"],
    ["/v1/devices/{deviceId}/conversations/{conversationId}/approvals/{approvalRequestId}/decision:", "post"],
  ]);

  for (const path of stage6ControlPlanePaths) {
    const pathBlockLines = extractPathBlock(source, path);
    assert.equal(pathBlockLines.length > 0, true);
    const methodNames = extractMethodBlocks(pathBlockLines).map((methodBlock) => methodBlock.method);
    assert.equal(methodNames.includes(expectDefined(expectedMethods.get(path), `${path} should have an expected method`)), true);
  }
});

test("when control plane routes are maintained, no unversioned public control plane paths should exist", () => {
  const source = readFileSync(openApiPath, "utf8");
  const controlPlanePathLines = source
    .split("\n")
    .filter((line) => /^  \/.+:\s*$/.test(line))
    .filter((line) => /control-plane|\/devices\/\{deviceId\}/i.test(line));

  assert.equal(controlPlanePathLines.length > 0, true);
  assert.deepEqual(
    controlPlanePathLines.filter((line) => !/^  \/v1\//.test(line)),
    [],
  );
});

test("when task board api is maintained, openapi should define versioned stage 7 task paths", () => {
  const source = readFileSync(openApiPath, "utf8");
  const versionedPathLines = extractVersionedPathLines(source);

  for (const path of stage7TaskPaths) {
    assert.equal(versionedPathLines.includes(path), true);
  }

  const expectedMethods = new Map<(typeof stage7TaskPaths)[number], readonly string[]>([
    ["/v1/tasks:", ["get", "post"]],
    ["/v1/tasks/{taskId}/conversation-links:", ["post"]],
    ["/v1/tasks/{taskId}/conversation-links/{deviceId}/{conversationId}:", ["delete"]],
  ]);

  for (const path of stage7TaskPaths) {
    const pathBlockLines = extractPathBlock(source, path);
    assert.equal(pathBlockLines.length > 0, true);
    const methodNames = extractMethodBlocks(pathBlockLines).map((methodBlock) => methodBlock.method);
    const expectedMethodNames = expectDefined(expectedMethods.get(path), `${path} should have expected methods`);
    assert.deepEqual(methodNames.sort(), [...expectedMethodNames].sort());
  }
});

test("when task board routes are maintained, no unversioned public task paths should exist", () => {
  const source = readFileSync(openApiPath, "utf8");
  const taskPathLines = source
    .split("\n")
    .filter((line) => /^  \/.+:\s*$/.test(line))
    .filter((line) => /\/tasks/i.test(line));

  assert.equal(taskPathLines.length > 0, true);
  assert.deepEqual(
    taskPathLines.filter((line) => !/^  \/v1\//.test(line)),
    [],
  );
});

test("when task board missing-task errors are maintained, only task link routes should use TaskNotFoundError", () => {
  const source = readFileSync(openApiPath, "utf8");
  const taskNotFoundOperations: string[] = [];

  for (const path of extractVersionedPathLines(source)) {
    const pathBlockLines = extractPathBlock(source, path);
    for (const methodBlock of extractMethodBlocks(pathBlockLines)) {
      const responseRefs = extractResponseRefs(methodBlock.lines);
      const notFoundRefs = responseRefs.get("404")?.componentResponseRefs ?? [];
      if (notFoundRefs.includes("TaskNotFoundError")) {
        taskNotFoundOperations.push(`${path}${methodBlock.method}`);
      }
    }
  }

  const expectedTaskNotFoundOperations = [
    "/v1/tasks/{taskId}/conversation-links:post",
    "/v1/tasks/{taskId}/conversation-links/{deviceId}/{conversationId}:delete",
  ].sort();

  assert.deepEqual(taskNotFoundOperations.sort(), expectedTaskNotFoundOperations);
});

test("when task board schemas are maintained, BoardTask should use device scoped conversation links", () => {
  const source = readFileSync(openApiPath, "utf8");
  const boardTaskBlockLines = expectSchemaDisallowsAdditionalProperties(source, "BoardTask");
  const boardTaskSource = boardTaskBlockLines.join("\n");
  const taskLinkSource = expectSchemaDisallowsAdditionalProperties(source, "TaskConversationLink").join("\n");
  const createTaskInputSource = expectSchemaDisallowsAdditionalProperties(source, "CreateTaskInput").join("\n");
  const linkTaskInputSource = expectSchemaDisallowsAdditionalProperties(source, "LinkTaskConversationInput").join("\n");

  assert.match(boardTaskSource, /^        linkedConversations:\s*$/m);
  assert.doesNotMatch(boardTaskSource, /^        linkedConversationIds:\s*$/m);
  assert.match(boardTaskSource, /^        createdAt:\s*$/m);
  assert.match(boardTaskSource, /^        updatedAt:\s*$/m);
  assert.match(boardTaskSource, /#\/components\/schemas\/TaskConversationLink/);
  assert.match(taskLinkSource, /^        projectId:\s*$/m);
  assert.match(taskLinkSource, /^        linkedAt:\s*$/m);
  assert.match(createTaskInputSource, /^        clientRequestId:\s*$/m);
  assert.match(linkTaskInputSource, /^        projectId:\s*$/m);
  assert.match(source, /TaskNotFoundError:/);
  assert.match(source, /#\/components\/responses\/TaskNotFoundError/);
});

test("when control plane api is maintained, device scoped routes should reuse existing public schemas", () => {
  const source = readFileSync(openApiPath, "utf8");
  const forbiddenParallelSchemas = [
    "ControlPlaneConversation",
    "ControlPlaneTimeline",
    "DeviceConversation",
    "DeviceTimeline",
  ];

  for (const schemaName of forbiddenParallelSchemas) {
    assert.equal(extractSchemaBlock(source, schemaName).length, 0, `${schemaName} should not exist`);
  }

  const schemaRefsByPath = new Map<(typeof stage6ControlPlanePaths)[number], readonly string[]>([
    ["/v1/control-plane/health:", ["ControlPlaneHealth"]],
    ["/v1/devices:", ["Device"]],
    ["/v1/projects:", ["RemoteProject"]],
    ["/v1/conversations:", ["CodexConversation"]],
    ["/v1/devices/{deviceId}/projects:", ["RemoteProject"]],
    ["/v1/devices/{deviceId}/worker/health:", ["WorkerHealth"]],
    ["/v1/devices/{deviceId}/worker/capabilities:", ["WorkerCapabilities"]],
    ["/v1/devices/{deviceId}/conversations/{conversationId}/timeline:", ["ConversationTimeline"]],
    ["/v1/devices/{deviceId}/conversations/{conversationId}/approvals:", ["PendingApproval"]],
    ["/v1/devices/{deviceId}/conversations:", ["StartConversationInput", "CommandAccepted"]],
    ["/v1/devices/{deviceId}/conversations/{conversationId}/follow-up:", ["FollowUpInput", "CommandAccepted"]],
    ["/v1/devices/{deviceId}/conversations/{conversationId}/turns/{turnId}/interrupt:", ["InterruptTurnInput", "CommandAccepted"]],
    ["/v1/devices/{deviceId}/conversations/{conversationId}/turns/{turnId}/steer:", ["SteerTurnInput", "CommandAccepted"]],
    ["/v1/devices/{deviceId}/conversations/{conversationId}/approvals/{approvalRequestId}/decision:", ["ApprovalDecisionInput", "CommandAccepted"]],
  ]);

  for (const [path, schemaRefs] of schemaRefsByPath) {
    const pathSource = extractPathBlock(source, path).join("\n");
    for (const schemaRef of schemaRefs) {
      assert.match(pathSource, new RegExp(`#\\/components\\/schemas\\/${schemaRef}`));
    }
  }
});

test("when worker control schemas are maintained, request limits should stay explicit", () => {
  const source = readFileSync(openApiPath, "utf8");

  for (const schemaName of controlRequestSchemas) {
    const schemaBlockLines = expectSchemaDisallowsAdditionalProperties(source, schemaName);
    expectPropertyMaxLength(schemaBlockLines, "clientRequestId", 128);
  }

  const steerInputBlockLines = extractSchemaBlock(source, "SteerTurnInput");
  expectPropertyMaxLength(steerInputBlockLines, "message", 20000);
});

test("when worker approval schemas are maintained, public approval shape should stay narrowed", () => {
  const source = readFileSync(openApiPath, "utf8");
  const pendingApprovalBlockLines = expectSchemaDisallowsAdditionalProperties(source, "PendingApproval");
  const approvalDecisionInputBlockLines = expectSchemaDisallowsAdditionalProperties(source, "ApprovalDecisionInput");

  expectPropertyEnum(pendingApprovalBlockLines, "kind", [
    "command_execution",
    "file_change",
    "legacy_exec",
    "legacy_apply_patch",
  ]);
  expectPropertyEnum(pendingApprovalBlockLines, "status", ["pending"]);
  expectPropertyMaxLength(pendingApprovalBlockLines, "summary", 200);
  expectPropertyEnum(approvalDecisionInputBlockLines, "decision", ["accept", "decline", "cancel"]);
});

test("when control plane and task board api types are exported, public aliases should derive from generated schemas", () => {
  const publicExportSource = readFileSync(new URL("index.ts", import.meta.url), "utf8");

  for (const aliasName of [
    "InterruptTurnInput",
    "SteerTurnInput",
    "PendingApproval",
    "ApprovalDecisionInput",
    "ControlPlaneHealth",
    "TaskConversationLink",
    "CreateTaskInput",
    "LinkTaskConversationInput",
  ]) {
    assert.match(
      publicExportSource,
      new RegExp(`export type ${aliasName} = components\\["schemas"\\]\\["${aliasName}"\\];`),
    );
  }
});

test("when worker write http api errors are maintained, stage 4 write routes should use ErrorEnvelope", () => {
  const source = readFileSync(openApiPath, "utf8");
  const componentResponseDefs = getComponentResponseUsesErrorEnvelope(source);

  for (const path of stage4WritePaths) {
    const pathBlockLines = extractPathBlock(source, path);
    const method = expectDefined(
      extractMethodBlocks(pathBlockLines).find((methodBlock) => methodBlock.method === "post"),
      `${path} should define POST`,
    );
    const responseRefs = extractResponseRefs(method.lines);

    for (const status of stage4WriteErrorStatuses[path]) {
      const responseInfo = responseRefs.get(status);
      assert.equal(typeof responseInfo, "object");
      const responseRefsErrorEnvelope = responseInfo
        ? responseInfo.componentResponseRefs.some((responseName) => componentResponseDefs.get(responseName) === true)
        : false;
      assert.equal(responseInfo?.hasDirectSchemaRef || responseRefsErrorEnvelope, true);
    }
  }
});

test("when worker control http api errors are maintained, stage 5 control routes should use ErrorEnvelope", () => {
  const source = readFileSync(openApiPath, "utf8");
  const componentResponseDefs = getComponentResponseUsesErrorEnvelope(source);

  for (const path of stage5ControlPaths) {
    const pathBlockLines = extractPathBlock(source, path);
    const method = expectDefined(extractMethodBlocks(pathBlockLines)[0], `${path} should define a method`);
    const responseRefs = extractResponseRefs(method.lines);

    for (const status of stage5ControlErrorStatuses[path]) {
      const responseInfo = responseRefs.get(status);
      assert.equal(typeof responseInfo, "object");
      const responseRefsErrorEnvelope = responseInfo
        ? responseInfo.componentResponseRefs.some((responseName) => componentResponseDefs.get(responseName) === true)
        : false;
      assert.equal(responseInfo?.hasDirectSchemaRef || responseRefsErrorEnvelope, true);
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
    const blockLine = expectDefined(errorEnvelopeBlock[i], "details block line should exist");
    if (blockLine.trim() === "") {
      continue;
    }
    if (indentOf(blockLine) <= detailsIndent) {
      detailsBlockEnd = i;
      break;
    }
  }

  const detailsBlock = errorEnvelopeBlock.slice(detailsBlockStart, detailsBlockEnd).join("\n");
  const additionalPropertiesIsFalse = /^ {10}additionalProperties:\s*false$/m;
  const propertiesBlock = extractBlockLines(detailsBlock, /^ {10}properties:\s*$/).join("\n");
  const allowlistedKeys = [
    "operation",
    "retryable",
    "diagnosticId",
    "reason",
    "field",
    "limit",
    "expected",
    "actualKind",
    "deviceId",
  ];
  const propertyKeys = [
    ...propertiesBlock.matchAll(/^ {12}([A-Za-z][A-Za-z0-9_-]*):\s*$/gm),
  ].map((match) => expectDefined(match[1], "property key capture should exist"));

  assert.equal(additionalPropertiesIsFalse.test(detailsBlock), true);
  assert.deepEqual(new Set(propertyKeys), new Set(allowlistedKeys));
});
