import assert from "node:assert/strict";
import test from "node:test";

import type { GetAuthStatusResponse, v2 } from "@codex-remote/codex-protocol";

import {
  projectRuntimeAccountSummary,
  projectRuntimeConfigPosture,
  projectRuntimeExperimentalFeatures,
  projectRuntimeModels,
  projectRuntimePermissionProfiles,
  projectRuntimeProviderCapabilities,
} from "./runtimeSettingsProjections.ts";

test("runtime settings projections when projecting app-server responses, should return public summary shapes", () => {
  const models = projectRuntimeModels({
    data: [
      {
        id: "gpt-5",
        model: "gpt-5",
        upgrade: null,
        upgradeInfo: null,
        availabilityNux: null,
        displayName: "GPT-5",
        description: "private description",
        hidden: false,
        supportedReasoningEfforts: ["minimal", "medium"] as never,
        defaultReasoningEffort: "medium" as never,
        inputModalities: ["text", "image"] as never,
        supportsPersonality: true,
        additionalSpeedTiers: ["flex"],
        serviceTiers: [{ id: "default", name: "Default" }] as never,
        defaultServiceTier: "default",
        isDefault: true,
      },
    ],
    nextCursor: null,
  });
  const account = projectRuntimeAccountSummary(
    {
      account: { type: "chatgpt", email: "owner@example.com", planType: "plus" as never },
      requiresOpenaiAuth: false,
    },
    { authMethod: "chatgpt" as never, authToken: "SECRET_TOKEN", requiresOpenaiAuth: false },
  );

  assert.deepEqual(models, [
    {
      id: "gpt-5",
      displayName: "GPT-5",
      isDefault: true,
      supportedReasoningEfforts: ["minimal", "medium"],
      inputModalities: ["text", "image"],
      serviceTiers: ["default"],
    },
  ]);
  assert.deepEqual(projectRuntimeProviderCapabilities({ namespaceTools: true, imageGeneration: true, webSearch: true }), {
    supportsReasoning: true,
    supportsImages: true,
    supportsWebSearch: true,
    supportsStructuredOutput: true,
  });
  assert.deepEqual(account, {
    type: "chatgpt",
    planType: "plus",
    emailDomain: "example.com",
    requiresOpenaiAuth: false,
  });
});

test("runtime settings projections when input contains sensitive values, should omit forbidden response values", () => {
  const leakMarkers = [
    "owner@example.com",
    "SECRET_TOKEN",
    "sk-secret-value",
    "/Users/Vint/private/project",
    "jsonrpc",
    "developer prompt",
    "compact prompt",
    "command output",
    "@@ -1,1 +1,1 @@",
    "stack",
    "cause",
  ];
  const config = projectRuntimeConfigPosture({
    config: {
      model: "gpt-5",
      review_model: "gpt-5-review",
      model_provider: "openai",
      approval_policy: "on-request" as never,
      approvals_reviewer: "codex" as never,
      sandbox_mode: "workspace-write" as never,
      model_reasoning_effort: "high" as never,
      service_tier: "default",
      web_search: "enabled" as never,
      instructions: "developer prompt /Users/Vint/private/project",
      developer_instructions: "sk-secret-value",
      compact_prompt: "compact prompt",
      cwd: "/Users/Vint/private/project",
      rawConfig: { jsonrpc: "2.0" },
    } as unknown as v2.Config,
    origins: {
      model: { source: "/Users/Vint/private/config.toml", path: "/Users/Vint/private/config.toml" } as never,
    },
    layers: [{ path: "/Users/Vint/private/config.toml", config: {} }] as never,
  });
  const account = projectRuntimeAccountSummary(
    {
      account: { type: "chatgpt", email: "owner@example.com", planType: "plus" as never },
      requiresOpenaiAuth: false,
    },
    { authMethod: "chatgpt" as never, authToken: "SECRET_TOKEN", requiresOpenaiAuth: false },
  );
  const permissions = projectRuntimePermissionProfiles({
    data: [{ id: "default", description: "command output @@ -1,1 +1,1 @@" }],
    nextCursor: null,
  });
  const experiments = projectRuntimeExperimentalFeatures({
    data: [
      {
        name: "beta",
        stage: "beta",
        displayName: "stack trace",
        description: "cause: /Users/Vint/private/project",
        announcement: "SECRET_TOKEN",
        enabled: true,
        defaultEnabled: false,
      },
    ],
    nextCursor: null,
  });

  const serialized = JSON.stringify({ config, account, permissions, experiments });

  for (const marker of leakMarkers) {
    assert.doesNotMatch(serialized, new RegExp(escapeRegExp(marker)));
  }
  assert.equal(config.customGuidanceOmitted, true);
  assert.equal(config.developerGuidanceOmitted, true);
  assert.equal(config.compactionGuidanceOmitted, true);
  assert.equal(account.emailDomain, "example.com");
});

test("runtime settings projections when responses exceed public limits, should bound arrays to 50", () => {
  const models = projectRuntimeModels({
    data: Array.from({ length: 55 }, (_, index) => ({
      id: `model-${index}`,
      model: `model-${index}`,
      upgrade: null,
      upgradeInfo: null,
      availabilityNux: null,
      displayName: `Model ${index}`,
      description: "",
      hidden: false,
      supportedReasoningEfforts: [],
      defaultReasoningEffort: "medium" as never,
      inputModalities: [],
      supportsPersonality: false,
      additionalSpeedTiers: [],
      serviceTiers: [],
      defaultServiceTier: null,
      isDefault: false,
    })),
    nextCursor: null,
  });
  const permissions = projectRuntimePermissionProfiles({
    data: Array.from({ length: 55 }, (_, index) => ({ id: `profile-${index}`, description: null })),
    nextCursor: null,
  });
  const experiments = projectRuntimeExperimentalFeatures({
    data: Array.from({ length: 55 }, (_, index) => ({
      name: `feature-${index}`,
      stage: "beta",
      displayName: null,
      description: null,
      announcement: null,
      enabled: false,
      defaultEnabled: false,
    })),
    nextCursor: null,
  });

  assert.equal(models.length, 50);
  assert.equal(permissions.length, 50);
  assert.equal(experiments.length, 50);
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
