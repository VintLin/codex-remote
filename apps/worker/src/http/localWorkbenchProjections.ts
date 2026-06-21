import { realpath, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, join, normalize, relative, sep } from "node:path";

import type {
  ExtensionInventory,
  McpServerSummary,
  ProjectGitSummary,
} from "@codex-remote/api-contract";
import type { GitDiffToRemoteResponse } from "@codex-remote/codex-protocol";
import type { v2 } from "@codex-remote/codex-protocol";

import { WorkerHttpError } from "./errors.ts";

const unsafeTextPatterns = [
  /sk-[A-Za-z0-9_-]{8,}/i,
  /\bsecret\b/i,
  /\btoken\b/i,
  /prompt/i,
  /\bdiff --git\b/i,
  /^@@ /m,
  /\bjsonrpc\b/i,
  /\bcommand output\b/i,
  /(?:^|[^\w])\/Users\//,
  /[A-Za-z]:[\\/]/,
];

export async function resolveProjectPath(
  allowedProjectRoot: string,
  requestedPath: string | undefined,
): Promise<{ absolutePath: string; relativePath: string }> {
  const canonicalRoot = await realpath(allowedProjectRoot);
  const relativePath = normalizeRequestedPath(requestedPath);
  const candidatePath = relativePath ? join(canonicalRoot, relativePath) : canonicalRoot;

  let canonicalTarget: string;
  try {
    canonicalTarget = await realpath(candidatePath);
  } catch {
    throw new WorkerHttpError(400, "invalid_request", "Request validation failed.", {
      operation: "local_workbench_path",
      field: "path",
      retryable: false,
    });
  }

  const projectRelativePath = toProjectRelativePath(canonicalRoot, canonicalTarget);
  if (relativePath !== "" && projectRelativePath !== relativePath) {
    throwProjectPathForbidden();
  }

  return {
    absolutePath: canonicalTarget,
    relativePath: projectRelativePath,
  };
}

export function projectGitDiffToSummary(
  response: GitDiffToRemoteResponse,
  allowedProjectRoot: string,
): ProjectGitSummary {
  let branch = "unknown";
  let aheadCount = 0;
  let behindCount = 0;
  let stagedCount = 0;
  let unstagedCount = 0;
  let untrackedCount = 0;
  const changedFiles: ProjectGitSummary["changedFiles"] = [];

  for (const line of response.diff.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const branchMatch = /^##\s+([^\s.]+)(?:\.\.\.[^\s]+)?(?:\s+\[(.+)\])?$/.exec(line);
    if (branchMatch) {
      const rawBranch = branchMatch[1];
      if (!rawBranch) {
        continue;
      }
      branch = rawBranch === "HEAD" ? "detached" : rawBranch;
      const counts = branchMatch[2] ?? "";
      aheadCount = parseBracketCount(counts, "ahead");
      behindCount = parseBracketCount(counts, "behind");
      continue;
    }

    const untrackedMatch = /^\?\?\s+(.+)$/.exec(line);
    if (untrackedMatch) {
      const rawPath = untrackedMatch[1];
      if (!rawPath) {
        continue;
      }
      const path = sanitizeGitPath(rawPath, allowedProjectRoot);
      if (path) {
        untrackedCount += 1;
        changedFiles.push({
          path,
          status: "untracked",
          additions: null,
          deletions: null,
        });
      }
      continue;
    }

    const statusMatch = /^([ MARCDU?])([ MARCDU?])\s+(.+?)(?:\s+\|\s+\d+\s+([+-]+))?$/.exec(line);
    if (!statusMatch) {
      continue;
    }

    const indexStatus = statusMatch[1];
    const worktreeStatus = statusMatch[2];
    const rawPath = statusMatch[3];
    if (!indexStatus || !worktreeStatus || !rawPath) {
      continue;
    }
    if (indexStatus === " " && worktreeStatus === " ") {
      continue;
    }
    const path = sanitizeGitPath(rawPath, allowedProjectRoot);
    if (!path) {
      continue;
    }

    if (indexStatus !== " " && indexStatus !== "?") {
      stagedCount += 1;
    }
    if (worktreeStatus !== " " && worktreeStatus !== "?") {
      unstagedCount += 1;
    }

    const stats = statusMatch[4] ?? "";
    changedFiles.push({
      path,
      status: mapGitStatus(indexStatus, worktreeStatus),
      additions: stats ? countChar(stats, "+") : 0,
      deletions: stats ? countChar(stats, "-") : 0,
    });
  }

  const status = branch === "detached"
    ? "detached"
    : changedFiles.length > 0 || stagedCount > 0 || unstagedCount > 0 || untrackedCount > 0
      ? "dirty"
      : "clean";

  return {
    branch,
    status,
    aheadCount,
    behindCount,
    stagedCount,
    unstagedCount,
    untrackedCount,
    reviewState: "unknown",
    changedFiles: changedFiles.slice(0, 100),
  };
}

export function projectMcpServerSummary(input: {
  deviceId: string;
  projectId: string;
  response: v2.ListMcpServerStatusResponse;
}): McpServerSummary {
  return {
    deviceId: input.deviceId,
    projectId: input.projectId,
    servers: input.response.data.slice(0, 50).map((server) => ({
      name: fallbackName(server.name, "mcp-server"),
      status: server.serverInfo || Object.keys(server.tools).length > 0 ? "connected" : "unknown",
      description: sanitizePublicText(server.serverInfo?.description ?? null),
      tools: Object.values(server.tools)
        .flatMap((tool) => (tool ? [fallbackName(tool.name, "tool")] : []))
        .slice(0, 50),
      resources: server.resources.map((resource) => fallbackName(resource.name, "resource")).slice(0, 50),
      resourceTemplates: server.resourceTemplates
        .map((template) => fallbackName(template.name, "resource-template"))
        .slice(0, 50),
      authStatus: mapMcpAuthStatus(server.authStatus),
    })),
  };
}

export function projectExtensionInventory(input: {
  deviceId: string;
  projectId: string;
  skills: v2.SkillsListResponse;
  hooks: v2.HooksListResponse;
  pluginList: v2.PluginListResponse;
  pluginDetails: v2.PluginReadResponse[];
  apps: v2.AppsListResponse;
}): ExtensionInventory {
  return {
    deviceId: input.deviceId,
    projectId: input.projectId,
    skills: input.skills.data
      .flatMap((entry) => entry.skills)
      .slice(0, 100)
      .map((skill) => ({
        name: fallbackName(skill.name, "skill"),
        enabled: skill.enabled,
        description: sanitizePublicText(skill.description),
        status: "installed",
      })),
    hooks: input.hooks.data
      .flatMap((entry) => entry.hooks)
      .slice(0, 100)
      .map((hook) => ({
        name: fallbackName(hook.key, "hook"),
        enabled: hook.enabled,
        description: null,
        event: hook.eventName,
      })),
    plugins: input.pluginDetails.slice(0, 100).map(({ plugin }) => ({
      id: fallbackName(plugin.summary.id, "plugin"),
      name: fallbackName(plugin.summary.name, "plugin"),
      enabled: plugin.summary.enabled,
      description: sanitizePublicText(plugin.description),
      skillCount: plugin.skills.length,
      appCount: plugin.apps.length,
      mcpServerCount: plugin.mcpServers.length,
    })),
    marketplaceEntries: input.pluginList.marketplaces.slice(0, 100).map((marketplace) => ({
      name: fallbackName(marketplace.name, "marketplace"),
      installStatus: marketplace.plugins.some((plugin) => plugin.installed) ? "installed" : "not_installed",
      description: null,
    })),
    apps: input.apps.data.slice(0, 100).map((app) => ({
      id: fallbackName(app.id, "app"),
      name: fallbackName(app.name, "app"),
      enabled: app.isEnabled,
      description: sanitizePublicText(app.description),
    })),
  };
}

export function sanitizePublicText(value: string | null | undefined, maxLength = 200): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (unsafeTextPatterns.some((pattern) => pattern.test(trimmed))) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

export function detectMimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".md":
      return "text/markdown";
    case ".ts":
    case ".tsx":
    case ".js":
    case ".jsx":
    case ".json":
    case ".txt":
    case ".yml":
    case ".yaml":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

export async function getDirectoryChildCount(path: string): Promise<number | null> {
  try {
    const metadata = await stat(path);
    if (!metadata.isDirectory()) {
      return null;
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeRequestedPath(requestedPath: string | undefined): string {
  const raw = requestedPath?.trim() ?? "";
  if (!raw || raw === ".") {
    return "";
  }

  const unixPath = raw.replaceAll("\\", "/");
  if (isAbsolute(unixPath)) {
    throwProjectPathForbidden();
  }

  const normalizedPath = normalize(unixPath).replaceAll(sep, "/").replace(/^\.\/+/, "");
  if (
    normalizedPath === ".." ||
    normalizedPath.startsWith("../") ||
    normalizedPath.includes("/../") ||
    normalizedPath === ""
  ) {
    throwProjectPathForbidden();
  }

  return normalizedPath;
}

function toProjectRelativePath(root: string, target: string): string {
  const pathFromRoot = relative(root, target).replaceAll(sep, "/");
  if (pathFromRoot.startsWith("..") || pathFromRoot.startsWith("/")) {
    throwProjectPathForbidden();
  }

  return pathFromRoot === "." ? "" : pathFromRoot;
}

function throwProjectPathForbidden(): never {
  throw new WorkerHttpError(403, "project_forbidden", "Requested project is outside the allowed root.", {
    operation: "local_workbench_path",
    retryable: false,
  });
}

function parseBracketCount(segment: string, key: "ahead" | "behind"): number {
  const match = new RegExp(`${key}\\s+(\\d+)`).exec(segment);
  return match ? Number(match[1]) : 0;
}

function sanitizeGitPath(rawPath: string, allowedProjectRoot: string): string | null {
  const trimmed = rawPath.trim();
  if (!trimmed || unsafeTextPatterns.some((pattern) => pattern.test(trimmed))) {
    return null;
  }

  const arrowIndex = trimmed.indexOf(" -> ");
  if (arrowIndex >= 0) {
    const sourcePath = sanitizeGitSinglePath(trimmed.slice(0, arrowIndex), allowedProjectRoot);
    const targetPath = sanitizeGitSinglePath(trimmed.slice(arrowIndex + 4), allowedProjectRoot);
    if (!sourcePath || !targetPath) {
      return null;
    }

    return targetPath;
  }

  return sanitizeGitSinglePath(trimmed, allowedProjectRoot);
}

function sanitizeGitSinglePath(rawPath: string, allowedProjectRoot: string): string | null {
  const trimmed = rawPath.trim();
  if (!trimmed || unsafeTextPatterns.some((pattern) => pattern.test(trimmed))) {
    return null;
  }

  if (isAbsolute(trimmed)) {
    try {
      return toProjectRelativePath(allowedProjectRoot, trimmed);
    } catch {
      return null;
    }
  }

  const normalizedPath = normalize(trimmed.replaceAll("\\", "/")).replaceAll(sep, "/");
  if (
    normalizedPath === "." ||
    normalizedPath === ".." ||
    normalizedPath.startsWith("../") ||
    normalizedPath.includes("/../") ||
    /^[A-Za-z]:\//.test(normalizedPath)
  ) {
    return null;
  }

  return normalizedPath;
}

function mapGitStatus(indexStatus: string, worktreeStatus: string): ProjectGitSummary["changedFiles"][number]["status"] {
  const effectiveStatus = indexStatus !== " " && indexStatus !== "?" ? indexStatus : worktreeStatus;
  switch (effectiveStatus) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "M":
      return "modified";
    default:
      return "unknown";
  }
}

function countChar(value: string, char: string): number {
  return [...value].filter((entry) => entry === char).length;
}

function mapMcpAuthStatus(status: v2.McpAuthStatus): "ready" | "needs_auth" | "error" | "unknown" {
  switch (status) {
    case "bearerToken":
    case "oAuth":
      return "ready";
    case "notLoggedIn":
      return "needs_auth";
    default:
      return "unknown";
  }
}

function fallbackName(value: string, fallback: string): string {
  const sanitized = sanitizePublicText(value, 200);
  return sanitized ?? basename(fallback);
}
