import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runProductReadinessCheck } from "./product-readiness-check.mjs";

const repoRoot = new URL("../", import.meta.url).pathname;

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "codex-remote-readiness-"));
  for (const path of ["package.json", "apps", "packages", "docs", "scripts"]) {
    cpSync(join(repoRoot, path), join(root, path), { recursive: true });
  }
  rmSync(join(root, "apps/web/.next"), { recursive: true, force: true });
  return root;
}

function updateJson(path, updater) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  updater(value);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

test("product readiness check when repo invariants are current should pass", () => {
  assert.deepEqual(runProductReadinessCheck(repoRoot), []);
});

test("product readiness check when root script is missing should fail", () => {
  const root = createFixture();
  try {
    updateJson(join(root, "package.json"), (packageJson) => {
      delete packageJson.scripts["web:start"];
    });
    assert.match(runProductReadinessCheck(root).join("\n"), /missing script web:start/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("product readiness check when real local stack scripts are missing should fail", () => {
  const root = createFixture();
  try {
    updateJson(join(root, "package.json"), (packageJson) => {
      delete packageJson.scripts["real:start"];
      delete packageJson.scripts["real:status"];
      delete packageJson.scripts["real:stop"];
    });
    const failures = runProductReadinessCheck(root).join("\n");
    assert.match(failures, /package\.json missing script real:start/);
    assert.match(failures, /package\.json missing script real:status/);
    assert.match(failures, /package\.json missing script real:stop/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("product readiness check when package script is missing should fail", () => {
  const root = createFixture();
  try {
    updateJson(join(root, "apps/worker/package.json"), (packageJson) => {
      delete packageJson.scripts["serve:read"];
    });
    assert.match(runProductReadinessCheck(root).join("\n"), /apps\/worker\/package\.json missing script serve:read/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("product readiness check when operationId is removed should fail", () => {
  const root = createFixture();
  try {
    const openApiPath = join(root, "packages/api-contract/openapi.yaml");
    writeFileSync(openApiPath, readFileSync(openApiPath, "utf8").replace(/^      operationId: listControlPlaneDevices\n/m, ""));
    assert.match(runProductReadinessCheck(root).join("\n"), /GET \/v1\/devices missing operationId/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("product readiness check when public schema is open should fail", () => {
  const root = createFixture();
  try {
    const openApiPath = join(root, "packages/api-contract/openapi.yaml");
    writeFileSync(openApiPath, readFileSync(openApiPath, "utf8").replace(/^      additionalProperties: false\n/m, ""));
    assert.match(runProductReadinessCheck(root).join("\n"), /missing additionalProperties false/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("product readiness check when Web stops binding loopback should fail", () => {
  const root = createFixture();
  try {
    updateJson(join(root, "apps/web/package.json"), (packageJson) => {
      packageJson.scripts.dev = "next dev --hostname 0.0.0.0 --port 5173";
    });
    assert.match(runProductReadinessCheck(root).join("\n"), /apps\/web\/package\.json missing loopback readiness guard/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("product readiness check when Control Plane imports Worker internals should fail", () => {
  const root = createFixture();
  try {
    const file = join(root, "apps/control-plane/src/badImport.ts");
    writeFileSync(file, "import '../../worker/src/index.ts';\n");
    assert.match(runProductReadinessCheck(root).join("\n"), /imports forbidden Worker\/protocol boundary/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("product readiness check when Web imports DB through a relative path should fail", () => {
  const root = createFixture();
  try {
    const file = join(root, "apps/web/src/badImport.ts");
    writeFileSync(file, "import '../../../packages/db/src/index.ts';\n");
    assert.match(runProductReadinessCheck(root).join("\n"), /imports forbidden product boundary/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("product readiness check when docs contain secret-shaped values should fail", () => {
  const root = createFixture();
  try {
    mkdirSync(join(root, "docs/references/product-readiness-fixtures"), { recursive: true });
    writeFileSync(join(root, "docs/references/product-readiness-fixtures/unsafe.md"), "Token sk-abcdefghijklmnopqrstuvwx\n");
    assert.match(runProductReadinessCheck(root).join("\n"), /sensitive-shaped value/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("product readiness check when package scripts contain token assignments should fail", () => {
  const root = createFixture();
  try {
    updateJson(join(root, "package.json"), (packageJson) => {
      packageJson.scripts["unsafe:start"] = "CODEX_REMOTE_CONTROL_PLANE_TOKEN=realbearertoken12345 pnpm web:start";
    });
    assert.match(runProductReadinessCheck(root).join("\n"), /package\.json contains sensitive-shaped value/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("product readiness check when reference docs contain token assignments should fail", () => {
  const root = createFixture();
  try {
    writeFileSync(
      join(root, "docs/references/README.md"),
      'Unsafe examples: CODEX_REMOTE_WORKER_TOKEN=realworkertoken12345 and {"publicToken":"realpublictoken12345"}\n',
    );
    assert.match(runProductReadinessCheck(root).join("\n"), /docs\/references\/README\.md contains sensitive-shaped value/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
