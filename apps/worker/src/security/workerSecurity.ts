import { relative, resolve } from "node:path";

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
  const normalizedRoot = resolve(root);
  const normalizedPath = resolve(path);
  const pathFromRoot = relative(normalizedRoot, normalizedPath);

  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !pathFromRoot.startsWith("/"));
}

export function canReadThreadPath(threadCwd: string | null, allowedRoot: string): boolean {
  if (!threadCwd) {
    return false;
  }

  return isPathInsideRoot(threadCwd, allowedRoot);
}
