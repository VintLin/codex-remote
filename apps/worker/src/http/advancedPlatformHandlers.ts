import type { AdvancedPlatformReadinessSummary, ErrorEnvelope } from "@codex-remote/api-contract";
import type { v2 } from "@codex-remote/codex-protocol";

import { mapUnknownError, toErrorEnvelope, WorkerHttpError } from "./errors.ts";
import type { WorkerReadOnlyAppServerClient, WorkerReadOnlyHandlerContext } from "./readOnlyHandlers.ts";
import {
  createAdvancedPlatformWatchlistItems,
  projectWindowsSandboxReadinessSection,
  projectWindowsSandboxReadinessUnavailableSection,
  type AdvancedPlatformPublicPlatform,
} from "./advancedPlatformProjections.ts";

export interface WorkerAdvancedPlatformAppServerClient extends WorkerReadOnlyAppServerClient {
  readWindowsSandboxReadiness(): Promise<v2.WindowsSandboxReadinessResponse>;
}

export interface WorkerAdvancedPlatformHandlerContext extends Omit<WorkerReadOnlyHandlerContext, "openClient"> {
  openClient(): Promise<WorkerAdvancedPlatformAppServerClient>;
  platform?(): AdvancedPlatformPublicPlatform;
}

const localProjectId = "local-project";

export async function getAdvancedPlatformReadinessSummary(
  context: WorkerAdvancedPlatformHandlerContext,
  projectId: string,
): Promise<AdvancedPlatformReadinessSummary> {
  assertProjectId(projectId);

  const platform = context.platform?.() ?? currentPlatform();
  const watchlistItems = createAdvancedPlatformWatchlistItems();

  if (platform !== "windows") {
    return {
      deviceId: context.config.deviceId,
      projectId,
      readAt: context.now(),
      platform,
      readinessSections: [projectWindowsSandboxReadinessSection(platform, { status: "ready" })],
      watchlistItems,
    };
  }

  let client: WorkerAdvancedPlatformAppServerClient;
  try {
    client = await context.openClient();
  } catch (error) {
    return {
      deviceId: context.config.deviceId,
      projectId,
      readAt: context.now(),
      platform,
      readinessSections: [projectWindowsSandboxReadinessUnavailableSection(sectionErrorEnvelope(error))],
      watchlistItems,
    };
  }

  try {
    try {
      const readiness = await client.readWindowsSandboxReadiness();
      return {
        deviceId: context.config.deviceId,
        projectId,
        readAt: context.now(),
        platform,
        readinessSections: [projectWindowsSandboxReadinessSection(platform, readiness)],
        watchlistItems,
      };
    } catch (error) {
      return {
        deviceId: context.config.deviceId,
        projectId,
        readAt: context.now(),
        platform,
        readinessSections: [projectWindowsSandboxReadinessUnavailableSection(sectionErrorEnvelope(error))],
        watchlistItems,
      };
    }
  } finally {
    client.close();
  }
}

function sectionErrorEnvelope(error: unknown): ErrorEnvelope {
  return toErrorEnvelope(mapUnknownError(error, "advanced_platform.windows_sandbox"), "advanced-platform-section");
}

function assertProjectId(projectId: string): void {
  if (projectId !== localProjectId) {
    throw new WorkerHttpError(403, "project_forbidden", "Requested project is outside the allowed root.", {
      operation: "advanced_platform_project",
      retryable: false,
    });
  }
}

function currentPlatform(): AdvancedPlatformPublicPlatform {
  switch (process.platform) {
    case "darwin":
      return "macos";
    case "win32":
      return "windows";
    case "linux":
      return "linux";
    default:
      return "unknown";
  }
}
