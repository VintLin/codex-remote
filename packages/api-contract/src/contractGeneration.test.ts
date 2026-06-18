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
