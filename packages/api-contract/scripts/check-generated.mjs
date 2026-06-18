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
