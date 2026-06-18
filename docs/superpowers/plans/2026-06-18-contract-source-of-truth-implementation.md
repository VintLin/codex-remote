# Contract Source Of Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hand-written API contract field definitions with a schema-backed generation flow, add the Codex app-server protocol package shell, and enforce dependency boundaries with tests.

**Architecture:** `packages/api-contract/openapi.yaml` becomes the Control Plane-shaped API source. Generated TypeScript lives under `packages/api-contract/src/generated/`, and public exports re-export generated types without redeclaring fields. `packages/codex-protocol` holds Codex app-server generated artifacts and metadata, while boundary tests prevent Web, Control Plane, or UI from importing the wrong contracts.

**Tech Stack:** TypeScript, Node built-in test runner, OpenAPI 3.1, `openapi-typescript`, pnpm, Turborepo, Codex CLI `app-server generate-ts` / `generate-json-schema`.

---

## File Structure

- `packages/api-contract/openapi.yaml`: source of truth for Control Plane-shaped API schemas and first route envelopes.
- `packages/api-contract/src/generated/openapi.ts`: generated TypeScript from `openapi.yaml`; committed output, never manually edited.
- `packages/api-contract/src/index.ts`: public type exports; no local field declarations.
- `packages/api-contract/scripts/check-generated.mjs`: verifies generated TypeScript matches `openapi.yaml`.
- `packages/api-contract/src/contractGeneration.test.ts`: package-level generation and public export tests.
- `packages/api-contract/package.json`: adds `generate`, `check:generated`, and wires tests.
- `packages/codex-protocol/package.json`: new package for generated upstream app-server protocol artifacts.
- `packages/codex-protocol/src/generated/app-server.ts`: generated TypeScript from `codex app-server generate-ts`.
- `packages/codex-protocol/schema/app-server.schema.json`: generated JSON Schema from `codex app-server generate-json-schema`.
- `packages/codex-protocol/generation-metadata.json`: records Codex CLI version and generation commands.
- `packages/codex-protocol/README.md`: documents generated-file ownership and dependency boundary.
- `packages/codex-protocol/src/index.ts`: public re-export for Worker internals.
- `packages/codex-protocol/src/protocolGeneration.test.ts`: verifies generated artifacts and metadata exist.
- `apps/web/src/contracts/packageBoundary.test.ts`: scans app and package imports for dependency rule violations.
- `apps/web/src/data/app-server/mockData.ts`: imports renamed generated API contract types after migration.
- `apps/web/src/data/app-server/appServerMockAdapter.ts`: imports renamed generated API contract types after migration.
- `apps/web/src/domain/sidebar/sidebarModel.ts`: imports renamed generated API contract types after migration.
- `apps/web/src/domain/status/statusPresentation.ts`: imports renamed generated status types after migration.
- `apps/web/src/components/sidebar/sidebar.tsx`: imports renamed generated API contract types after migration.
- `apps/web/src/components/detail/main-panels.tsx`: imports renamed generated API contract types after migration.
- `apps/web/src/components/shared/icons.tsx`: imports renamed generated API contract types after migration.
- `pnpm-lock.yaml`: updates dependency lock after adding `openapi-typescript`.

## Task 1: Add API Contract Schema And Failing Generation Test

**Files:**
- Create: `packages/api-contract/openapi.yaml`
- Create: `packages/api-contract/src/contractGeneration.test.ts`
- Modify: `packages/api-contract/package.json`

- [ ] **Step 1: Add the OpenAPI source file**

Create `packages/api-contract/openapi.yaml`:

```yaml
openapi: 3.1.0
info:
  title: Codex Remote API Contract
  version: 0.1.0
  description: Control Plane-shaped contract shared by Web, Worker, Control Plane, and future iOS clients.
jsonSchemaDialect: https://json-schema.org/draft/2020-12/schema
paths:
  /devices:
    get:
      operationId: listDevices
      responses:
        "200":
          description: Devices visible to the current actor.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/Device"
  /projects:
    get:
      operationId: listRemoteProjects
      parameters:
        - name: deviceId
          in: query
          required: false
          schema:
            type: string
      responses:
        "200":
          description: Remote projects visible to the current actor.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/RemoteProject"
  /conversations:
    get:
      operationId: listCodexConversations
      parameters:
        - name: deviceId
          in: query
          required: false
          schema:
            type: string
        - name: projectId
          in: query
          required: false
          schema:
            type: string
      responses:
        "200":
          description: Codex conversations visible to the current actor.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/CodexConversation"
  /conversations/{conversationId}/follow-up:
    post:
      operationId: followUpConversation
      parameters:
        - name: conversationId
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/FollowUpInput"
      responses:
        "202":
          description: Follow-up accepted.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/CommandAccepted"
components:
  schemas:
    DeviceConnectionStatus:
      type: string
      enum:
        - Connected
        - Not connected
    ConversationStatus:
      type: string
      enum:
        - running
        - waiting
        - done
        - failed
        - unknown
    TaskStatus:
      type: string
      enum:
        - in_progress
        - waiting
        - done
    DiffKind:
      type: string
      enum:
        - context
        - add
        - remove
    Device:
      type: object
      additionalProperties: false
      required:
        - id
        - icon
        - name
        - status
        - ip
        - lastOnlineAt
        - currentProject
        - model
      properties:
        id:
          type: string
        icon:
          type: string
        name:
          type: string
        status:
          $ref: "#/components/schemas/DeviceConnectionStatus"
        ip:
          type: string
        lastOnlineAt:
          type: string
        currentProject:
          type: string
        model:
          type: string
    RemoteProject:
      type: object
      additionalProperties: false
      required:
        - id
        - name
        - deviceId
        - path
        - branch
        - hasChanges
        - pinned
      properties:
        id:
          type: string
        name:
          type: string
        deviceId:
          type: string
        path:
          type: string
        branch:
          type: string
        hasChanges:
          type: boolean
        pinned:
          type: boolean
        expanded:
          type: boolean
    CodexConversation:
      type: object
      additionalProperties: false
      required:
        - id
        - title
        - deviceId
        - projectName
        - status
        - updatedAt
        - summary
        - sandbox
        - approval
      properties:
        id:
          type: string
        title:
          type: string
        deviceId:
          type: string
        projectId:
          type: string
        projectName:
          type: string
        status:
          $ref: "#/components/schemas/ConversationStatus"
        updatedAt:
          type: string
        summary:
          type: string
        sandbox:
          type: string
        approval:
          type: string
        pinned:
          type: boolean
    BoardTask:
      type: object
      additionalProperties: false
      required:
        - id
        - title
        - status
        - linkedConversationIds
      properties:
        id:
          type: string
        title:
          type: string
        status:
          $ref: "#/components/schemas/TaskStatus"
        linkedConversationIds:
          type: array
          items:
            type: string
    DiffLine:
      type: object
      additionalProperties: false
      required:
        - line
        - kind
        - text
      properties:
        line:
          type: number
        kind:
          $ref: "#/components/schemas/DiffKind"
        text:
          type: string
    ConversationInputItem:
      type: object
      additionalProperties: false
      required:
        - type
        - text
      properties:
        type:
          type: string
          enum:
            - text
        text:
          type: string
    FollowUpInput:
      type: object
      additionalProperties: false
      required:
        - deviceId
        - input
      properties:
        deviceId:
          type: string
        projectId:
          type: string
        input:
          type: array
          items:
            $ref: "#/components/schemas/ConversationInputItem"
    CommandAccepted:
      type: object
      additionalProperties: false
      required:
        - commandId
        - acceptedAt
      properties:
        commandId:
          type: string
        acceptedAt:
          type: string
    ErrorEnvelope:
      type: object
      additionalProperties: false
      required:
        - code
        - message
      properties:
        code:
          type: string
        message:
          type: string
        details:
          type: object
          additionalProperties: true
        requestId:
          type: string
```

- [ ] **Step 2: Add a failing generation test**

Create `packages/api-contract/src/contractGeneration.test.ts`:

```ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const packageRoot = new URL("../", import.meta.url);
const openApiPath = new URL("../openapi.yaml", packageRoot);
const generatedPath = new URL("generated/openapi.ts", import.meta.url);
const publicExportsPath = new URL("index.ts", import.meta.url);

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

test("when public api types are exported, index should not redeclare schema fields", () => {
  const source = readFileSync(publicExportsPath, "utf8");
  const forbiddenDefinitions = source
    .split("\n")
    .filter((line) => /^(export\s+)?(interface|type)\s+(Device|RemoteProject|CodexConversation|BoardTask|DiffLine)\b/.test(line.trim()));

  assert.deepEqual(forbiddenDefinitions, []);
  assert.match(source, /from "\.\/generated\/openapi"/);
});
```

- [ ] **Step 3: Run the failing test**

Run:

```bash
pnpm --filter @codex-remote/api-contract test
```

Expected: fail because `packages/api-contract/src/generated/openapi.ts` does not exist and `src/index.ts` still redeclares fields.

- [ ] **Step 4: Add generation scripts to package.json**

Modify `packages/api-contract/package.json`:

```json
{
  "name": "@codex-remote/api-contract",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "pnpm check:generated && tsc --noEmit --pretty false",
    "typecheck": "pnpm check:generated && tsc --noEmit --pretty false",
    "generate": "openapi-typescript openapi.yaml -o src/generated/openapi.ts",
    "check:generated": "node scripts/check-generated.mjs",
    "test": "pnpm check:generated && node --test",
    "lint": "pnpm check:generated && tsc --noEmit --pretty false"
  },
  "devDependencies": {
    "openapi-typescript": "^7.10.1",
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 5: Install the generator dependency**

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` includes `openapi-typescript` for `packages/api-contract`.

- [ ] **Step 6: Leave the red state uncommitted**

Run:

```bash
git status --short
```

Expected: `packages/api-contract/openapi.yaml`, `packages/api-contract/src/contractGeneration.test.ts`, `packages/api-contract/package.json`, and `pnpm-lock.yaml` are modified or untracked. Do not commit this red state. Task 2 completes the generation implementation and commits the passing state.

## Task 2: Generate API Types And Replace Hand-Written Exports

**Files:**
- Create: `packages/api-contract/scripts/check-generated.mjs`
- Create: `packages/api-contract/src/generated/openapi.ts`
- Modify: `packages/api-contract/src/index.ts`
- Modify: Web imports that still use old transitional names.

- [ ] **Step 1: Add the generated output checker**

Create `packages/api-contract/scripts/check-generated.mjs`:

```js
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedPath = resolve(packageRoot, "src/generated/openapi.ts");
const temporaryPath = resolve(packageRoot, ".contract-check/openapi.ts");

mkdirSync(dirname(temporaryPath), { recursive: true });
execFileSync("pnpm", ["exec", "openapi-typescript", "openapi.yaml", "-o", temporaryPath], {
  cwd: packageRoot,
  stdio: "pipe",
});

if (!existsSync(generatedPath)) {
  throw new Error("Generated contract is missing. Run pnpm --filter @codex-remote/api-contract generate.");
}

const expected = readFileSync(temporaryPath, "utf8");
const actual = readFileSync(generatedPath, "utf8");
rmSync(resolve(packageRoot, ".contract-check"), { recursive: true, force: true });

if (expected !== actual) {
  throw new Error("Generated contract is stale. Run pnpm --filter @codex-remote/api-contract generate.");
}
```

- [ ] **Step 2: Generate TypeScript from OpenAPI**

Run:

```bash
pnpm --filter @codex-remote/api-contract generate
```

Expected: creates `packages/api-contract/src/generated/openapi.ts`.

- [ ] **Step 3: Replace public exports with generated aliases**

Replace `packages/api-contract/src/index.ts` with:

```ts
import type { components } from "./generated/openapi";

export type DeviceConnectionStatus = components["schemas"]["DeviceConnectionStatus"];
export type ConversationStatus = components["schemas"]["ConversationStatus"];
export type TaskStatus = components["schemas"]["TaskStatus"];
export type DiffKind = components["schemas"]["DiffKind"];

export type Device = components["schemas"]["Device"];
export type RemoteProject = components["schemas"]["RemoteProject"];
export type CodexConversation = components["schemas"]["CodexConversation"];
export type BoardTask = components["schemas"]["BoardTask"];
export type DiffLine = components["schemas"]["DiffLine"];
export type ConversationInputItem = components["schemas"]["ConversationInputItem"];
export type FollowUpInput = components["schemas"]["FollowUpInput"];
export type CommandAccepted = components["schemas"]["CommandAccepted"];
export type ErrorEnvelope = components["schemas"]["ErrorEnvelope"];

export type SidebarProject = RemoteProject;
export type Conversation = CodexConversation;
```

- [ ] **Step 4: Verify API contract tests now pass**

Run:

```bash
pnpm --filter @codex-remote/api-contract test
```

Expected: pass.

- [ ] **Step 5: Verify Web still compiles with compatibility aliases**

Run:

```bash
pnpm --filter @codex-remote/web typecheck
```

Expected: pass because `SidebarProject` and `Conversation` still exist as aliases.

- [ ] **Step 6: Commit Task 1 and Task 2 together**

Run:

```bash
git add packages/api-contract/openapi.yaml packages/api-contract/package.json packages/api-contract/scripts/check-generated.mjs packages/api-contract/src/contractGeneration.test.ts packages/api-contract/src/generated/openapi.ts packages/api-contract/src/index.ts pnpm-lock.yaml
git commit -m "feat: generate api contract types from schema"
```

Expected: commit succeeds.

## Task 3: Move Web To Canonical Contract Names

**Files:**
- Modify: `apps/web/src/data/app-server/mockData.ts`
- Modify: `apps/web/src/data/app-server/appServerMockAdapter.ts`
- Modify: `apps/web/src/domain/sidebar/sidebarModel.ts`
- Modify: `apps/web/src/domain/sidebar/sidebarModel.test.ts`
- Modify: `apps/web/src/domain/status/statusPresentation.ts`
- Modify: `apps/web/src/components/sidebar/sidebar.tsx`
- Modify: `apps/web/src/components/detail/main-panels.tsx`
- Modify: `apps/web/src/components/shared/icons.tsx`
- Modify: `apps/web/src/contracts/factories.test.ts`

- [ ] **Step 1: Update the entity source boundary test**

Modify `apps/web/src/contracts/factories.test.ts` so the forbidden local definitions use canonical names:

```ts
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
```

- [ ] **Step 2: Run the boundary test**

Run:

```bash
pnpm --filter @codex-remote/web test -- src/contracts/factories.test.ts
```

Expected: pass.

- [ ] **Step 3: Update Web imports to canonical names**

Apply these changes:

```ts
// apps/web/src/data/app-server/mockData.ts
import type { BoardTask, CodexConversation, Device, DiffLine, RemoteProject } from "@codex-remote/api-contract";
```

```ts
// apps/web/src/data/app-server/appServerMockAdapter.ts
import type { BoardTask, CodexConversation, ConversationStatus, Device, RemoteProject } from "@codex-remote/api-contract";
```

```ts
// apps/web/src/domain/sidebar/sidebarModel.ts
import type { CodexConversation, RemoteProject } from "@codex-remote/api-contract";
```

```ts
// apps/web/src/domain/sidebar/sidebarModel.test.ts
import type { CodexConversation, RemoteProject } from "@codex-remote/api-contract";
```

```ts
// apps/web/src/domain/status/statusPresentation.ts
import type { ConversationStatus, DeviceConnectionStatus, TaskStatus } from "@codex-remote/api-contract";
```

```ts
// apps/web/src/components/sidebar/sidebar.tsx
import type { CodexConversation, Device } from "@codex-remote/api-contract";
```

```ts
// apps/web/src/components/detail/main-panels.tsx
import type { CodexConversation, Device, DeviceConnectionStatus, TaskStatus } from "@codex-remote/api-contract";
```

```ts
// apps/web/src/components/shared/icons.tsx
import type { Device } from "@codex-remote/api-contract";
```

Then rename local type references:

```text
SidebarProject -> RemoteProject
Conversation -> CodexConversation
```

Keep exported function and component names unchanged.

- [ ] **Step 4: Verify Web typecheck**

Run:

```bash
pnpm --filter @codex-remote/web typecheck
```

Expected: pass.

- [ ] **Step 5: Verify Web tests**

Run:

```bash
pnpm --filter @codex-remote/web test
```

Expected: 63 tests pass, or more if new tests were added.

- [ ] **Step 6: Remove compatibility aliases**

Modify `packages/api-contract/src/index.ts` to remove:

```ts
export type SidebarProject = RemoteProject;
export type Conversation = CodexConversation;
```

- [ ] **Step 7: Verify the whole workspace**

Run:

```bash
pnpm typecheck
pnpm test
```

Expected: both pass.

- [ ] **Step 8: Commit Task 3**

Run:

```bash
git add apps/web/src packages/api-contract/src/index.ts
git commit -m "refactor: use canonical api contract names"
```

Expected: commit succeeds.

## Task 4: Add Codex Protocol Package

**Files:**
- Create: `packages/codex-protocol/package.json`
- Create: `packages/codex-protocol/tsconfig.json`
- Create: `packages/codex-protocol/README.md`
- Create: `packages/codex-protocol/src/index.ts`
- Create: `packages/codex-protocol/src/protocolGeneration.test.ts`
- Create: `packages/codex-protocol/src/generated/app-server.ts`
- Create: `packages/codex-protocol/schema/app-server.schema.json`
- Create: `packages/codex-protocol/generation-metadata.json`

- [ ] **Step 1: Add package metadata**

Create `packages/codex-protocol/package.json`:

```json
{
  "name": "@codex-remote/codex-protocol",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc --noEmit --pretty false",
    "typecheck": "tsc --noEmit --pretty false",
    "test": "node --test",
    "lint": "tsc --noEmit --pretty false"
  },
  "devDependencies": {
    "typescript": "^5.8.3"
  }
}
```

Create `packages/codex-protocol/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules"],
  "compilerOptions": {
    "noEmit": true
  }
}
```

- [ ] **Step 2: Add generated-file documentation**

Create `packages/codex-protocol/README.md`:

```md
# @codex-remote/codex-protocol

This package contains Codex app-server protocol artifacts generated from the installed Codex CLI.

Generated files are owned by upstream Codex protocol generation:

- `src/generated/app-server.ts`
- `schema/app-server.schema.json`
- `generation-metadata.json`

Do not hand-edit generated artifacts. Regenerate them from the same Codex CLI version and update `generation-metadata.json` in the same commit.

Only `apps/worker` may consume this package. Web, Control Plane, UI, and DB packages must use `@codex-remote/api-contract` instead.
```

- [ ] **Step 3: Generate Codex app-server protocol artifacts**

Run:

```bash
mkdir -p packages/codex-protocol/src/generated packages/codex-protocol/schema
codex app-server generate-ts > packages/codex-protocol/src/generated/app-server.ts
codex app-server generate-json-schema > packages/codex-protocol/schema/app-server.schema.json
```

Expected:

- `packages/codex-protocol/src/generated/app-server.ts` is non-empty TypeScript.
- `packages/codex-protocol/schema/app-server.schema.json` is non-empty JSON.

- [ ] **Step 4: Add generation metadata**

Create `packages/codex-protocol/generation-metadata.json` using the installed Codex version. For the current environment, use:

```json
{
  "codexVersion": "codex-cli 0.139.0",
  "generatedAt": "2026-06-18",
  "commands": [
    "codex app-server generate-ts > packages/codex-protocol/src/generated/app-server.ts",
    "codex app-server generate-json-schema > packages/codex-protocol/schema/app-server.schema.json"
  ],
  "outputs": [
    "src/generated/app-server.ts",
    "schema/app-server.schema.json"
  ]
}
```

- [ ] **Step 5: Add public exports**

Create `packages/codex-protocol/src/index.ts`:

```ts
export * from "./generated/app-server";
```

- [ ] **Step 6: Add protocol generation tests**

Create `packages/codex-protocol/src/protocolGeneration.test.ts`:

```ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const packageRoot = new URL("../", import.meta.url);
const generatedTypesPath = new URL("generated/app-server.ts", import.meta.url);
const schemaPath = new URL("../schema/app-server.schema.json", packageRoot);
const metadataPath = new URL("../generation-metadata.json", packageRoot);
const readmePath = new URL("../README.md", packageRoot);

test("when codex protocol is generated, generated artifacts should be present", () => {
  assert.equal(existsSync(generatedTypesPath), true);
  assert.equal(existsSync(schemaPath), true);

  const generatedTypes = readFileSync(generatedTypesPath, "utf8");
  const schema = readFileSync(schemaPath, "utf8");
  assert.ok(generatedTypes.length > 100);
  assert.ok(schema.length > 100);
});

test("when codex protocol is generated, metadata should record source commands", () => {
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as {
    codexVersion?: string;
    commands?: string[];
    outputs?: string[];
  };

  assert.equal(metadata.codexVersion, "codex-cli 0.139.0");
  assert.deepEqual(metadata.commands, [
    "codex app-server generate-ts > packages/codex-protocol/src/generated/app-server.ts",
    "codex app-server generate-json-schema > packages/codex-protocol/schema/app-server.schema.json",
  ]);
  assert.deepEqual(metadata.outputs, ["src/generated/app-server.ts", "schema/app-server.schema.json"]);
});

test("when protocol package is consumed, readme should document the Worker-only boundary", () => {
  const readme = readFileSync(readmePath, "utf8");

  assert.match(readme, /Only `apps\/worker` may consume this package/);
  assert.match(readme, /Do not hand-edit generated artifacts/);
});
```

- [ ] **Step 7: Verify package**

Run:

```bash
pnpm --filter @codex-remote/codex-protocol typecheck
pnpm --filter @codex-remote/codex-protocol test
```

Expected: both pass.

- [ ] **Step 8: Commit Task 4**

Run:

```bash
git add packages/codex-protocol pnpm-lock.yaml
git commit -m "feat: add codex protocol generated package"
```

Expected: commit succeeds.

## Task 5: Enforce Package Dependency Boundaries

**Files:**
- Create: `apps/web/src/contracts/packageBoundary.test.ts`
- Modify: `apps/web/src/contracts/sourcePathDiscipline.test.ts` only if shared file collection is needed.

- [ ] **Step 1: Add dependency boundary test**

Create `apps/web/src/contracts/packageBoundary.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the boundary test**

Run:

```bash
pnpm --filter @codex-remote/web test -- src/contracts/packageBoundary.test.ts
```

Expected: pass.

- [ ] **Step 3: Verify all Web contract tests**

Run:

```bash
pnpm --filter @codex-remote/web test -- src/contracts
```

Expected: all contract tests pass.

- [ ] **Step 4: Commit Task 5**

Run:

```bash
git add apps/web/src/contracts/packageBoundary.test.ts
git commit -m "test: enforce contract package boundaries"
```

Expected: commit succeeds.

## Task 6: Full Verification And Documentation Alignment

**Files:**
- Modify: `docs/specs/多设备 Codex 控制台 技术规格.md`
- Modify: `docs/superpowers/specs/2026-06-18-contract-source-of-truth-design.md` only if implementation changed a planned file path or command.

- [ ] **Step 1: Update dependency direction in technical spec**

Modify the dependency direction block in `docs/specs/多设备 Codex 控制台 技术规格.md` so it says:

```text
apps/web -> packages/api-contract, packages/ui, packages/shared
apps/control-plane -> packages/api-contract, packages/db, packages/shared
apps/worker -> packages/api-contract, packages/codex-protocol, packages/shared
packages/ui -> packages/shared
packages/api-contract -> packages/shared
packages/db -> packages/shared
```

Keep the existing forbidden direction list, and add:

```md
- `packages/ui` 不依赖 `packages/api-contract`；产品语义映射留在 apps 内。
```

- [ ] **Step 2: Run full verification**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected:

- `pnpm lint` succeeds.
- `pnpm typecheck` succeeds.
- `pnpm test` succeeds.
- `pnpm build` succeeds.

- [ ] **Step 3: Inspect Git state**

Run:

```bash
git status --short
git diff --stat
```

Expected: only the documentation alignment files are unstaged at this point.

- [ ] **Step 4: Commit Task 6**

Run:

```bash
git add docs/specs/多设备\ Codex\ 控制台\ 技术规格.md docs/superpowers/specs/2026-06-18-contract-source-of-truth-design.md
git commit -m "docs: align contract dependency boundaries"
```

Expected: commit succeeds.

- [ ] **Step 5: Final status check**

Run:

```bash
git status --short
git log --oneline -6
```

Expected: working tree is clean and the six task commits are visible.

## Execution Notes

- Use `apply_patch` for manual file edits.
- Do not hand-edit `packages/api-contract/src/generated/openapi.ts` after Task 2 generation.
- Do not hand-edit `packages/codex-protocol/src/generated/app-server.ts` or `packages/codex-protocol/schema/app-server.schema.json` after Task 4 generation.
- If `codex app-server generate-ts` output does not typecheck under the workspace `tsconfig`, add a narrow `// @ts-nocheck` header to the generated file by updating the generation command in Task 4 to:

```bash
{ printf '// @ts-nocheck\n'; codex app-server generate-ts; } > packages/codex-protocol/src/generated/app-server.ts
```

Then update `generation-metadata.json` commands and `protocolGeneration.test.ts` expected commands to match that exact generation command.

- If `openapi-typescript` emits different formatting than shown here, accept the generator output and rely on `check:generated` to enforce consistency.
