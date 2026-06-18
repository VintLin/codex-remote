import { readFileSync } from "node:fs";

export function readWebSource(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

export function readWorkspaceSource(relativePath: string): string {
  return readFileSync(new URL(`../../../../${relativePath}`, import.meta.url), "utf8");
}

export function readJsonFixture<T>(relativePath: string): T {
  return JSON.parse(readWebSource(relativePath)) as T;
}
