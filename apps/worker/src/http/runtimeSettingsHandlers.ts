import type { ErrorEnvelope, RuntimeSettingsSectionStatus, RuntimeSettingsSummary } from "@codex-remote/api-contract";
import type { GetAuthStatusResponse, v2 } from "@codex-remote/codex-protocol";

import { mapUnknownError, toErrorEnvelope, WorkerHttpError } from "./errors.ts";
import type { WorkerReadOnlyAppServerClient, WorkerReadOnlyHandlerContext } from "./readOnlyHandlers.ts";
import {
  emptyRuntimeConfigPosture,
  projectRuntimeAccountSummary,
  projectRuntimeConfigPosture,
  projectRuntimeExperimentalFeatures,
  projectRuntimeModels,
  projectRuntimePermissionProfiles,
  projectRuntimeProviderCapabilities,
} from "./runtimeSettingsProjections.ts";

export interface WorkerRuntimeSettingsAppServerClient extends WorkerReadOnlyAppServerClient {
  listModels(params: v2.ModelListParams): Promise<v2.ModelListResponse>;
  readModelProviderCapabilities(
    params: v2.ModelProviderCapabilitiesReadParams,
  ): Promise<v2.ModelProviderCapabilitiesReadResponse>;
  readAccount(params: v2.GetAccountParams): Promise<v2.GetAccountResponse>;
  getAuthStatus(params: { includeToken: boolean | null; refreshToken: boolean | null }): Promise<GetAuthStatusResponse>;
  readConfig(params: v2.ConfigReadParams): Promise<v2.ConfigReadResponse>;
  listPermissionProfiles(params: v2.PermissionProfileListParams): Promise<v2.PermissionProfileListResponse>;
  listExperimentalFeatures(params: v2.ExperimentalFeatureListParams): Promise<v2.ExperimentalFeatureListResponse>;
}

export interface WorkerRuntimeSettingsHandlerContext extends Omit<WorkerReadOnlyHandlerContext, "openClient"> {
  openClient(): Promise<WorkerRuntimeSettingsAppServerClient>;
}

const localProjectId = "local-project";
const maxItems = 50;

export async function getRuntimeSettingsSummary(
  context: WorkerRuntimeSettingsHandlerContext,
  projectId: string,
): Promise<RuntimeSettingsSummary> {
  assertProjectId(projectId);

  let client: WorkerRuntimeSettingsAppServerClient;
  try {
    client = await context.openClient();
  } catch (error) {
    const sectionError = sectionErrorEnvelope(error, "runtime_settings.open");
    return createUnavailableSummary(context, projectId, sectionError);
  }

  try {
    try {
      await client.readyz();
    } catch (error) {
      return createUnavailableSummary(context, projectId, sectionErrorEnvelope(error, "runtime_settings.readyz"));
    }

    const models = await readSection("models", () =>
      client.listModels({ cursor: null, limit: maxItems, includeHidden: false }).then(projectRuntimeModels),
    );
    const providerCapabilities = await readSection("providerCapabilities", () =>
      client.readModelProviderCapabilities({}).then(projectRuntimeProviderCapabilities),
    );
    const account = await readSection("account", async () => {
      const [accountResponse, authStatus] = await Promise.all([
        client.readAccount({ refreshToken: false }),
        client.getAuthStatus({ includeToken: false, refreshToken: false }),
      ]);
      return projectRuntimeAccountSummary(accountResponse, authStatus);
    });
    const config = await readSection("config", () =>
      client.readConfig({ includeLayers: false, cwd: context.config.allowedProjectRoot }).then(projectRuntimeConfigPosture),
    );
    const permissionProfiles = await readSection("permissionProfiles", () =>
      client
        .listPermissionProfiles({ cursor: null, limit: maxItems, cwd: context.config.allowedProjectRoot })
        .then(projectRuntimePermissionProfiles),
    );
    const experimentalFeatures = await readSection("experimentalFeatures", () =>
      client
        .listExperimentalFeatures({ cursor: null, limit: maxItems, threadId: null })
        .then(projectRuntimeExperimentalFeatures),
    );

    return {
      deviceId: context.config.deviceId,
      projectId,
      readAt: context.now(),
      sections: [
        models.section,
        providerCapabilities.section,
        account.section,
        config.section,
        permissionProfiles.section,
        experimentalFeatures.section,
      ],
      models: models.value ?? [],
      providerCapabilities: providerCapabilities.value ?? {
        supportsReasoning: false,
        supportsImages: false,
        supportsWebSearch: false,
        supportsStructuredOutput: false,
      },
      account: account.value ?? {
        type: "unknown",
        planType: null,
        emailDomain: null,
        requiresOpenaiAuth: false,
      },
      config: config.value ?? emptyRuntimeConfigPosture(),
      permissionProfiles: permissionProfiles.value ?? [],
      experimentalFeatures: experimentalFeatures.value ?? [],
    };
  } finally {
    client.close();
  }
}

async function readSection<T>(
  section: RuntimeSettingsSectionStatus["section"],
  read: () => Promise<T>,
): Promise<{ section: RuntimeSettingsSectionStatus; value: T | null }> {
  try {
    return {
      section: { section, status: "loaded" },
      value: await read(),
    };
  } catch (error) {
    return {
      section: {
        section,
        status: "degraded",
        error: sectionErrorEnvelope(error, `runtime_settings.${section}`),
      },
      value: null,
    };
  }
}

function createUnavailableSummary(
  context: WorkerRuntimeSettingsHandlerContext,
  projectId: string,
  error: ErrorEnvelope,
): RuntimeSettingsSummary {
  const sections: RuntimeSettingsSectionStatus["section"][] = [
    "models",
    "providerCapabilities",
    "account",
    "config",
    "permissionProfiles",
    "experimentalFeatures",
  ];

  return {
    deviceId: context.config.deviceId,
    projectId,
    readAt: context.now(),
    sections: sections.map((section) => ({ section, status: "unavailable", error })),
    models: [],
    providerCapabilities: {
      supportsReasoning: false,
      supportsImages: false,
      supportsWebSearch: false,
      supportsStructuredOutput: false,
    },
    account: {
      type: "unknown",
      planType: null,
      emailDomain: null,
      requiresOpenaiAuth: false,
    },
    config: emptyRuntimeConfigPosture(),
    permissionProfiles: [],
    experimentalFeatures: [],
  };
}

function sectionErrorEnvelope(error: unknown, operation: string): ErrorEnvelope {
  return toErrorEnvelope(mapUnknownError(error, operation), "runtime-settings-section");
}

function assertProjectId(projectId: string): void {
  if (projectId !== localProjectId) {
    throw new WorkerHttpError(403, "project_forbidden", "Requested project is outside the allowed root.", {
      operation: "runtime_settings_project",
      retryable: false,
    });
  }
}
