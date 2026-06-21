import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import type { GetAuthStatusResponse, v2 } from "@codex-remote/codex-protocol";

import { toErrorEnvelope, WorkerHttpError } from "./errors.ts";
import {
  getRuntimeSettingsSummary,
  type WorkerRuntimeSettingsAppServerClient,
  type WorkerRuntimeSettingsHandlerContext,
} from "./runtimeSettingsHandlers.ts";
import { createWorkerHttpApp } from "./workerHttpApp.ts";
import { createWorkerWriteHandlerState } from "./writeHandlers.ts";
import type { WorkerHttpConfig } from "./workerHttpConfig.ts";

const authHeaders = { authorization: "Bearer example-token" };

test("runtime settings handler when project is valid, should call safe read-only app-server methods with validated root", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-runtime-settings-"));
  const client = new FakeRuntimeSettingsClient();
  const context = createContext(projectRoot, client);

  const summary = await getRuntimeSettingsSummary(context, "local-project");

  assert.equal(summary.deviceId, "device-local");
  assert.equal(summary.projectId, "local-project");
  assert.equal(summary.sections.every((section) => section.status === "loaded"), true);
  assert.deepEqual(client.calls, [
    ["readyz", undefined],
    ["model/list", { cursor: null, limit: 50, includeHidden: false }],
    ["modelProvider/capabilities/read", {}],
    ["account/read", { refreshToken: false }],
    ["getAuthStatus", { includeToken: false, refreshToken: false }],
    ["config/read", { includeLayers: false, cwd: projectRoot }],
    ["permissionProfile/list", { cursor: null, limit: 50, cwd: projectRoot }],
    ["experimentalFeature/list", { cursor: null, limit: 50, threadId: null }],
  ]);
  assert.equal(context.openClientCount(), 1);
  assert.equal(client.closed, true);
});

test("runtime settings handler when a section fails, should degrade only that section with sanitized error", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-runtime-settings-"));
  const leakMarkers = [
    "SECRET_TOKEN",
    "owner@example.com",
    projectRoot,
    "ws://127.0.0.1:4321",
    "jsonrpc",
    "stack",
    "cause",
    "command output",
    "@@ -1,1 +1,1 @@",
  ];
  const client = new FakeRuntimeSettingsClient({
    configError: new Error(leakMarkers.join(" ")),
  });
  const context = createContext(projectRoot, client);

  const summary = await getRuntimeSettingsSummary(context, "local-project");
  const configStatus = summary.sections.find((section) => section.section === "config");

  assert.equal(configStatus?.status, "degraded");
  assert.equal(configStatus?.error?.code, "worker_internal_error");
  assert.deepEqual(summary.config, {
    model: null,
    reviewModel: null,
    modelProvider: null,
    approvalPolicy: null,
    approvalsReviewer: null,
    sandboxMode: null,
    reasoningEffort: null,
    serviceTier: null,
    webSearch: null,
    customGuidanceOmitted: false,
    developerGuidanceOmitted: false,
    compactionGuidanceOmitted: false,
  });
  const serialized = JSON.stringify(summary);
  for (const marker of leakMarkers) {
    assert.doesNotMatch(serialized, new RegExp(escapeRegExp(marker)));
  }
});

test("runtime settings handler when app-server is unavailable, should return unavailable sections without leaking diagnostics", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-runtime-settings-"));
  const leakMarkers = [
    "SECRET_TOKEN",
    projectRoot,
    "ws://127.0.0.1:4321",
    "jsonrpc",
    "stack",
    "cause",
  ];
  const client = new FakeRuntimeSettingsClient({
    readyzError: new Error(leakMarkers.join(" ")),
  });
  const context = createContext(projectRoot, client);

  const summary = await getRuntimeSettingsSummary(context, "local-project");

  assert.equal(summary.sections.every((section) => section.status === "unavailable"), true);
  assert.equal(summary.sections.every((section) => section.error?.code === "worker_internal_error"), true);
  assert.deepEqual(summary.models, []);
  assert.equal(client.closed, true);
  const serialized = JSON.stringify(summary);
  for (const marker of leakMarkers) {
    assert.doesNotMatch(serialized, new RegExp(escapeRegExp(marker)));
  }
});

test("runtime settings handler when project is invalid, should reject before opening app-server client", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-runtime-settings-"));
  const client = new FakeRuntimeSettingsClient();
  const context = createContext(projectRoot, client);

  await assert.rejects(
    getRuntimeSettingsSummary(context, "other-project"),
    (error) => error instanceof WorkerHttpError && error.status === 403 && error.code === "project_forbidden",
  );

  assert.equal(context.openClientCount(), 0);
  assert.deepEqual(client.calls, []);
});

test("worker http app when runtime settings route is requested, should return public summary without leak values", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-runtime-settings-"));
  const leakMarkers = [
    "SECRET_TOKEN",
    "owner@example.com",
    projectRoot,
    "ws://127.0.0.1:4321",
    "developer prompt",
    "compact prompt",
    "rawConfig",
    "layers",
  ];
  const context = createContext(projectRoot, new FakeRuntimeSettingsClient());
  const app = createWorkerHttpApp(context as never);

  const response = await app.request("http://127.0.0.1:8787/v1/projects/local-project/runtime-settings", {
    headers: authHeaders,
  });
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(body.projectId, "local-project");
  for (const marker of leakMarkers) {
    assert.doesNotMatch(serialized, new RegExp(escapeRegExp(marker)));
  }
});

test("worker http app when runtime settings project is invalid, should return project error without app-server calls", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "worker-runtime-settings-"));
  const client = new FakeRuntimeSettingsClient();
  const context = createContext(projectRoot, client);
  const app = createWorkerHttpApp(context as never);

  const response = await app.request("http://127.0.0.1:8787/v1/projects/other-project/runtime-settings", {
    headers: authHeaders,
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.code, "project_forbidden");
  assert.equal(context.openClientCount(), 0);
  assert.deepEqual(client.calls, []);
});

class FakeRuntimeSettingsClient implements WorkerRuntimeSettingsAppServerClient {
  closed = false;
  readonly calls: Array<[string, unknown]> = [];
  private readonly readyzError: Error | null;
  private readonly configError: Error | null;

  constructor(options: { configError?: Error; readyzError?: Error } = {}) {
    this.readyzError = options.readyzError ?? null;
    this.configError = options.configError ?? null;
  }

  async readyz(): Promise<void> {
    this.calls.push(["readyz", undefined]);
    if (this.readyzError) {
      throw this.readyzError;
    }
  }

  async initialize(): Promise<void> {}

  async initialized(): Promise<void> {}

  async listThreads(): Promise<v2.ThreadListResponse> {
    return { data: [], nextCursor: null, backwardsCursor: null };
  }

  async readThread(): Promise<v2.ThreadReadResponse> {
    throw new Error("unexpected_read_thread");
  }

  async listModels(params: v2.ModelListParams): Promise<v2.ModelListResponse> {
    this.calls.push(["model/list", params]);
    return {
      data: [
        {
          id: "gpt-5",
          model: "gpt-5",
          upgrade: null,
          upgradeInfo: null,
          availabilityNux: null,
          displayName: "GPT-5",
          description: "developer prompt",
          hidden: false,
          supportedReasoningEfforts: ["medium"] as never,
          defaultReasoningEffort: "medium" as never,
          inputModalities: ["text"] as never,
          supportsPersonality: true,
          additionalSpeedTiers: [],
          serviceTiers: [],
          defaultServiceTier: null,
          isDefault: true,
        },
      ],
      nextCursor: null,
    };
  }

  async readModelProviderCapabilities(
    params: v2.ModelProviderCapabilitiesReadParams,
  ): Promise<v2.ModelProviderCapabilitiesReadResponse> {
    this.calls.push(["modelProvider/capabilities/read", params]);
    return { namespaceTools: true, imageGeneration: true, webSearch: false };
  }

  async readAccount(params: v2.GetAccountParams): Promise<v2.GetAccountResponse> {
    this.calls.push(["account/read", params]);
    return {
      account: { type: "chatgpt", email: "owner@example.com", planType: "plus" as never },
      requiresOpenaiAuth: false,
    };
  }

  async getAuthStatus(params: { includeToken: boolean | null; refreshToken: boolean | null }): Promise<GetAuthStatusResponse> {
    this.calls.push(["getAuthStatus", params]);
    return { authMethod: "chatgpt" as never, authToken: "SECRET_TOKEN", requiresOpenaiAuth: false };
  }

  async readConfig(params: v2.ConfigReadParams): Promise<v2.ConfigReadResponse> {
    this.calls.push(["config/read", params]);
    if (this.configError) {
      throw this.configError;
    }
    return {
      config: {
        model: "gpt-5",
        review_model: "gpt-5-review",
        model_provider: "openai",
        approval_policy: "on-request" as never,
        approvals_reviewer: "codex" as never,
        sandbox_mode: "workspace-write" as never,
        model_reasoning_effort: "medium" as never,
        service_tier: "default",
        web_search: "enabled" as never,
        instructions: "developer prompt",
        developer_instructions: "sk-secret-value",
        compact_prompt: "compact prompt",
      } as unknown as v2.Config,
      origins: {},
      layers: [{ path: "/Users/Vint/private/config.toml", config: {} }] as never,
    };
  }

  async listPermissionProfiles(params: v2.PermissionProfileListParams): Promise<v2.PermissionProfileListResponse> {
    this.calls.push(["permissionProfile/list", params]);
    return { data: [{ id: "default", description: "Default profile" }], nextCursor: null };
  }

  async listExperimentalFeatures(params: v2.ExperimentalFeatureListParams): Promise<v2.ExperimentalFeatureListResponse> {
    this.calls.push(["experimentalFeature/list", params]);
    return {
      data: [
        {
          name: "feature",
          stage: "beta",
          displayName: "Feature",
          description: "Feature description",
          announcement: "SECRET_TOKEN",
          enabled: false,
          defaultEnabled: false,
        },
      ],
      nextCursor: null,
    };
  }

  close(): void {
    this.closed = true;
  }
}

function createContext(
  allowedProjectRoot: string,
  client: WorkerRuntimeSettingsAppServerClient,
): WorkerRuntimeSettingsHandlerContext & {
  writeState: ReturnType<typeof createWorkerWriteHandlerState>;
  openClientCount(): number;
} {
  let openClientCount = 0;

  return {
    config: {
      allowedOrigins: ["http://127.0.0.1:5173"],
      allowedProjectRoot,
      appServerTransport: "loopbackWebSocket",
      appServerUrl: "ws://127.0.0.1:4321",
      bindHost: "127.0.0.1",
      calibrationApprovalMode: null,
      connectTimeoutMs: 5_000,
      deviceId: "device-local",
      port: 8787,
      requestTimeoutMs: 5_000,
      startAppServer: false,
      workerToken: "example-token",
    } satisfies WorkerHttpConfig,
    now: () => "2026-06-22T00:00:00.000Z",
    writeState: createWorkerWriteHandlerState(),
    openClient: async () => {
      openClientCount += 1;
      return client;
    },
    openClientCount: () => openClientCount,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
