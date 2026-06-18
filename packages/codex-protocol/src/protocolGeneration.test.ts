import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const packageRoot = new URL("../", import.meta.url);
const generatedTypesPath = new URL("generated/app-server.ts", import.meta.url);
const schemaPath = new URL("schema/app-server.schema.json", packageRoot);
const metadataPath = new URL("generation-metadata.json", packageRoot);
const readmePath = new URL("README.md", packageRoot);

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
    "codex app-server generate-ts --out packages/codex-protocol/src/generated && cp packages/codex-protocol/src/generated/index.ts packages/codex-protocol/src/generated/app-server.ts",
    "codex app-server generate-json-schema --out /tmp/codex-protocol-app-server-schema && cp /tmp/codex-protocol-app-server-schema/codex_app_server_protocol.schemas.json packages/codex-protocol/schema/app-server.schema.json",
  ]);
  assert.deepEqual(metadata.outputs, ["src/generated/app-server.ts", "schema/app-server.schema.json"]);
});

test("when protocol package is consumed, readme should document the Worker-only boundary", () => {
  const readme = readFileSync(readmePath, "utf8");

  assert.match(readme, /Only `apps\/worker` may consume this package/);
  assert.match(readme, /Do not hand-edit generated artifacts/);
});
