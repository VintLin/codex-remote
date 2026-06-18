import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedPath = resolve(packageRoot, "src/generated/openapi.ts");
const temporaryDir = mkdtempSync(resolve(tmpdir(), "codex-remote-api-contract-"));
const temporaryPath = resolve(temporaryDir, "openapi.ts");

try {
  execFileSync("pnpm", ["exec", "openapi-typescript", "openapi.yaml", "-o", temporaryPath], {
    cwd: packageRoot,
    stdio: "pipe",
  });

  if (!existsSync(generatedPath)) {
    throw new Error("Generated contract is missing. Run pnpm --filter @codex-remote/api-contract generate.");
  }

  const expected = readFileSync(temporaryPath, "utf8");
  const actual = readFileSync(generatedPath, "utf8");

  if (expected !== actual) {
    throw new Error("Generated contract is stale. Run pnpm --filter @codex-remote/api-contract generate.");
  }
} finally {
  rmSync(temporaryDir, { recursive: true, force: true });
}
