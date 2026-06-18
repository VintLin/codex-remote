import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export function isBearerTokenAuthorized(header: string | undefined, expectedToken: string): boolean {
  if (!expectedToken.trim()) {
    return false;
  }

  return header === `Bearer ${expectedToken}`;
}

export function isOriginAllowed(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

export function isPathInsideRoot(path: string, root: string): boolean {
  if (!root.trim()) {
    return false;
  }

  const normalizedRoot = resolve(root);
  const normalizedPath = resolve(path);
  const pathFromRoot = relative(normalizedRoot, normalizedPath);

  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !pathFromRoot.startsWith("/") && !isAbsolute(pathFromRoot));
}

export function canReadThreadPath(threadCwd: string | null, allowedRoot: string): boolean {
  if (!threadCwd) {
    return false;
  }

  return isPathInsideRoot(threadCwd, allowedRoot);
}

async function canonicalizeExistingPath(path: string): Promise<string> {
  const normalizedPath = resolve(path);

  try {
    return await realpath(normalizedPath);
  } catch {
    return normalizedPath;
  }
}

export async function isPathInsideRootRealpath(path: string, root: string): Promise<boolean> {
  if (!root.trim()) {
    return false;
  }

  const canonicalRoot = await canonicalizeExistingPath(root);
  const canonicalPath = await canonicalizeExistingPath(path);
  const pathFromRoot = relative(canonicalRoot, canonicalPath);

  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !pathFromRoot.startsWith("/") && !isAbsolute(pathFromRoot));
}
