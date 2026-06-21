import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join, relative } from "node:path";

import type {
  ExtensionInventory,
  LocalWorkbenchSummary,
  McpServerSummary,
  ProjectDirectoryListing,
  ProjectFilePreview,
  ProjectGitSummary,
  ProjectSearchResult,
} from "@codex-remote/api-contract";
import type { GitDiffToRemoteResponse, FuzzyFileSearchResponse } from "@codex-remote/codex-protocol";
import type { v2 } from "@codex-remote/codex-protocol";

import { mapUnknownError, WorkerHttpError } from "./errors.ts";
import type {
  WorkerReadOnlyAppServerClient,
  WorkerReadOnlyHandlerContext,
} from "./readOnlyHandlers.ts";
import {
  detectMimeType,
  projectExtensionInventory,
  projectGitDiffToSummary,
  projectMcpServerSummary,
  resolveProjectPath,
} from "./localWorkbenchProjections.ts";

const maxDirectoryEntries = 200;
const maxPreviewBytes = 64_000;
const maxPreviewChars = 20_000;
const maxSearchResults = 100;

export interface WorkerLocalWorkbenchAppServerClient extends WorkerReadOnlyAppServerClient {
  gitDiffToRemote(params: { cwd: string }): Promise<GitDiffToRemoteResponse>;
  fuzzyFileSearch(params: { query: string; roots: string[]; cancellationToken: string | null }): Promise<FuzzyFileSearchResponse>;
  listMcpServerStatus(params: v2.ListMcpServerStatusParams): Promise<v2.ListMcpServerStatusResponse>;
  listSkills(params: v2.SkillsListParams): Promise<v2.SkillsListResponse>;
  listHooks(params: v2.HooksListParams): Promise<v2.HooksListResponse>;
  listPlugins(params: v2.PluginListParams): Promise<v2.PluginListResponse>;
  readPlugin(params: v2.PluginReadParams): Promise<v2.PluginReadResponse>;
  listApps(params: v2.AppsListParams): Promise<v2.AppsListResponse>;
}

export interface WorkerLocalWorkbenchHandlerContext extends Omit<WorkerReadOnlyHandlerContext, "openClient"> {
  openClient(): Promise<WorkerLocalWorkbenchAppServerClient>;
}

export async function getLocalWorkbenchSummary(
  context: WorkerLocalWorkbenchHandlerContext,
  projectId: string,
): Promise<LocalWorkbenchSummary> {
  assertProjectId(projectId);
  const [listing, git, mcp, extensions] = await Promise.all([
    listProjectFiles(context, projectId, ""),
    getProjectGitSummary(context, projectId),
    getMcpServerSummary(context, projectId),
    getExtensionInventory(context, projectId),
  ]);

  return {
    deviceId: context.config.deviceId,
    projectId,
    projectName: basename(context.config.allowedProjectRoot),
    fileCount: listing.entries.filter((entry) => entry.kind === "file").length,
    directoryCount: listing.entries.filter((entry) => entry.kind === "directory").length,
    gitStatus: git.status,
    searchResultCount: 0,
    mcpServerCount: mcp.servers.length,
    extensionCount:
      extensions.skills.length +
      extensions.hooks.length +
      extensions.plugins.length +
      extensions.marketplaceEntries.length +
      extensions.apps.length,
    previewAvailable: listing.entries.some((entry) => entry.kind === "file"),
  };
}

export async function listProjectFiles(
  context: WorkerLocalWorkbenchHandlerContext,
  projectId: string,
  path: string | undefined,
): Promise<ProjectDirectoryListing> {
  assertProjectId(projectId);
  const resolved = await resolveProjectPath(context.config.allowedProjectRoot, path);
  const directoryEntries = await readdir(resolved.absolutePath, { withFileTypes: true });
  const entries: ProjectDirectoryListing["entries"] = [];

  for (const entry of directoryEntries) {
    const relativePath = resolved.relativePath ? `${resolved.relativePath}/${entry.name}` : entry.name;
    let childPath: { absolutePath: string; relativePath: string };
    try {
      childPath = await resolveProjectPath(context.config.allowedProjectRoot, relativePath);
    } catch {
      continue;
    }

    const metadata = await stat(childPath.absolutePath);
    const kind = metadata.isDirectory() ? "directory" : "file";
    entries.push({
      path: childPath.relativePath,
      name: entry.name,
      kind,
      sizeBytes: kind === "file" ? metadata.size : null,
      modifiedAt: new Date(metadata.mtimeMs).toISOString(),
      childCount: null,
      truncated: false,
    });
  }

  entries.sort((left, right) => left.path.localeCompare(right.path));
  return { entries: entries.slice(0, maxDirectoryEntries) };
}

export async function getProjectFilePreview(
  context: WorkerLocalWorkbenchHandlerContext,
  projectId: string,
  path: string,
): Promise<ProjectFilePreview> {
  assertProjectId(projectId);
  const resolved = await resolveProjectPath(context.config.allowedProjectRoot, path);
  const metadata = await stat(resolved.absolutePath);
  const mimeType = detectMimeType(resolved.relativePath);

  if (metadata.isDirectory()) {
    return {
      path: resolved.relativePath,
      previewKind: "unavailable",
      mimeType,
      byteCount: null,
      lineCount: null,
      truncated: false,
      previewText: null,
      reason: "not_a_file",
    };
  }

  if (metadata.size > maxPreviewBytes) {
    return {
      path: resolved.relativePath,
      previewKind: "unavailable",
      mimeType,
      byteCount: metadata.size,
      lineCount: null,
      truncated: true,
      previewText: null,
      reason: "file_too_large",
    };
  }

  const buffer = await readFile(resolved.absolutePath);
  if (buffer.includes(0)) {
    return {
      path: resolved.relativePath,
      previewKind: "unavailable",
      mimeType: "application/octet-stream",
      byteCount: buffer.byteLength,
      lineCount: null,
      truncated: false,
      previewText: null,
      reason: "binary_file",
    };
  }

  const fullText = buffer.toString("utf8");
  const previewText = fullText.slice(0, maxPreviewChars);
  return {
    path: resolved.relativePath,
    previewKind: "text",
    mimeType,
    byteCount: buffer.byteLength,
    lineCount: fullText.split(/\r?\n/).length,
    truncated: previewText.length !== fullText.length,
    previewText,
    reason: null,
  };
}

export async function getProjectGitSummary(
  context: WorkerLocalWorkbenchHandlerContext,
  projectId: string,
): Promise<ProjectGitSummary> {
  assertProjectId(projectId);
  return await withClient(context, "gitDiffToRemote", async (client) =>
    projectGitDiffToSummary(await client.gitDiffToRemote({ cwd: context.config.allowedProjectRoot }), context.config.allowedProjectRoot),
  );
}

export async function searchProjectFiles(
  context: WorkerLocalWorkbenchHandlerContext,
  projectId: string,
  query: string,
  path: string | undefined,
  limit: number | undefined,
): Promise<ProjectSearchResult> {
  assertProjectId(projectId);
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    throw new WorkerHttpError(400, "invalid_request", "Request validation failed.", {
      operation: "local_workbench_search",
      field: "query",
      retryable: false,
    });
  }

  const resolved = await resolveProjectPath(context.config.allowedProjectRoot, path);
  const boundedLimit = Math.max(1, Math.min(limit ?? 20, maxSearchResults));
  return await withClient(context, "fuzzyFileSearch", async (client) => {
    const response = await client.fuzzyFileSearch({
      query: normalizedQuery,
      roots: [resolved.absolutePath],
      cancellationToken: null,
    });
    const matches: ProjectSearchResult["matches"] = [];

    for (const match of response.files.slice(0, boundedLimit)) {
      const absolutePath = match.path.startsWith("/") ? match.path : join(match.root, match.path);

      const projectRelativePath = normalizeSearchResultPath(relative(context.config.allowedProjectRoot, absolutePath));
      if (!projectRelativePath) {
        continue;
      }

      if (resolved.relativePath) {
        const requestedPrefix = `${resolved.relativePath}/`;
        if (projectRelativePath !== resolved.relativePath && !projectRelativePath.startsWith(requestedPrefix)) {
          continue;
        }
      }

      matches.push({
        path: projectRelativePath,
        lineNumber: 1,
        columnNumber: null,
        match: match.file_name.slice(0, 240),
        snippet: null,
        score: match.score,
      });
    }

    return {
      query: normalizedQuery.slice(0, 200),
      matches,
    };
  });
}

export async function getMcpServerSummary(
  context: WorkerLocalWorkbenchHandlerContext,
  projectId: string,
): Promise<McpServerSummary> {
  assertProjectId(projectId);
  return await withClient(context, "mcpServerStatus/list", async (client) =>
    projectMcpServerSummary({
      deviceId: context.config.deviceId,
      projectId,
      response: await client.listMcpServerStatus({ cursor: null, limit: 50, detail: "full" as never, threadId: null }),
    }),
  );
}

export async function getExtensionInventory(
  context: WorkerLocalWorkbenchHandlerContext,
  projectId: string,
): Promise<ExtensionInventory> {
  assertProjectId(projectId);
  return await withClient(context, "extensions/list", async (client) => {
    const [skills, hooks, pluginList, apps] = await Promise.all([
      client.listSkills({ cwds: [context.config.allowedProjectRoot], forceReload: false }),
      client.listHooks({ cwds: [context.config.allowedProjectRoot] }),
      client.listPlugins({ cwds: [context.config.allowedProjectRoot], marketplaceKinds: null }),
      client.listApps({ cursor: null, limit: 100, threadId: null, forceRefetch: false }),
    ]);

    const pluginDetails = await Promise.all(
      pluginList.marketplaces.flatMap((marketplace) =>
        marketplace.plugins.map((plugin) =>
          client.readPlugin({
            pluginName: plugin.name,
            marketplacePath: marketplace.path,
            remoteMarketplaceName: marketplace.path ? null : marketplace.name,
          }),
        ),
      ),
    );

    return projectExtensionInventory({
      deviceId: context.config.deviceId,
      projectId,
      skills,
      hooks,
      pluginList,
      pluginDetails,
      apps,
    });
  });
}

async function withClient<T>(
  context: WorkerLocalWorkbenchHandlerContext,
  operation: string,
  run: (client: WorkerLocalWorkbenchAppServerClient) => Promise<T>,
): Promise<T> {
  let client: WorkerLocalWorkbenchAppServerClient;

  try {
    client = await context.openClient();
  } catch (error) {
    throw mapUnknownError(error, operation);
  }

  try {
    await client.readyz();
    return await run(client);
  } catch (error) {
    throw mapUnknownError(error, operation);
  } finally {
    client.close();
  }
}

function assertProjectId(projectId: string): void {
  if (projectId !== "local-project") {
    throw new WorkerHttpError(403, "project_forbidden", "Requested project is outside the allowed root.", {
      operation: "local_workbench_project",
      retryable: false,
    });
  }
}

function normalizeSearchResultPath(path: string): string | null {
  const normalized = path.replaceAll("\\", "/");
  if (!normalized || normalized === "." || normalized.startsWith("..") || normalized.startsWith("/")) {
    return null;
  }

  return normalized;
}
