import type {
  RuntimeAccountSummary,
  RuntimeConfigPosture,
  RuntimeExperimentalFeatureSummary,
  RuntimeModelSummary,
  RuntimePermissionProfileSummary,
  RuntimeProviderCapabilities,
} from "@codex-remote/api-contract";
import type { GetAuthStatusResponse, v2 } from "@codex-remote/codex-protocol";

const maxItems = 50;
const unsafeTextPatterns = [
  /sk-[A-Za-z0-9_-]{8,}/i,
  /\bsecret\b/i,
  /\btoken\b/i,
  /\bstack\b/i,
  /\bcause\b/i,
  /prompt/i,
  /\bdiff --git\b/i,
  /^@@ /m,
  /\bjsonrpc\b/i,
  /\bcommand output\b/i,
  /(?:^|[^\w])\/Users\//,
  /[A-Za-z]:[\\/]/,
  /https?:\/\//i,
  /wss?:\/\//i,
];

export function projectRuntimeModels(response: v2.ModelListResponse): RuntimeModelSummary[] {
  return response.data.slice(0, maxItems).map((model) => ({
    id: sanitizeIdentifier(model.id, "model"),
    displayName: sanitizeRuntimeText(model.displayName, 200) ?? sanitizeIdentifier(model.model, "model"),
    isDefault: model.isDefault,
    supportedReasoningEfforts: model.supportedReasoningEfforts
      .map((effort) => typeof effort === "string" ? effort : String(effort.reasoningEffort))
      .map((effort) => sanitizeRuntimeText(effort, 80))
      .flatMap((effort) => effort ? [effort] : [])
      .slice(0, 20),
    inputModalities: model.inputModalities
      .map((modality) => sanitizeRuntimeText(String(modality), 80))
      .flatMap((modality) => modality ? [modality] : [])
      .slice(0, 20),
    serviceTiers: model.serviceTiers
      .map((tier) => sanitizeRuntimeText(typeof tier === "string" ? tier : tier.id, 80))
      .flatMap((tier) => tier ? [tier] : [])
      .slice(0, 20),
  }));
}

export function projectRuntimeProviderCapabilities(
  response: v2.ModelProviderCapabilitiesReadResponse,
): RuntimeProviderCapabilities {
  return {
    supportsReasoning: response.namespaceTools,
    supportsImages: response.imageGeneration,
    supportsWebSearch: response.webSearch,
    supportsStructuredOutput: response.namespaceTools,
  };
}

export function projectRuntimeAccountSummary(
  accountResponse: v2.GetAccountResponse,
  authStatus: GetAuthStatusResponse,
): RuntimeAccountSummary {
  const account = accountResponse.account;
  return {
    type: account?.type ?? sanitizeRuntimeText(String(authStatus.authMethod ?? "unknown"), 80) ?? "unknown",
    planType: account && "planType" in account ? sanitizeRuntimeText(String(account.planType), 80) : null,
    emailDomain: account && "email" in account ? emailDomain(account.email) : null,
    requiresOpenaiAuth: authStatus.requiresOpenaiAuth ?? accountResponse.requiresOpenaiAuth,
  };
}

export function projectRuntimeConfigPosture(response: v2.ConfigReadResponse): RuntimeConfigPosture {
  const config = response.config;
  return {
    model: sanitizeRuntimeText(config.model, 200),
    reviewModel: sanitizeRuntimeText(config.review_model, 200),
    modelProvider: sanitizeRuntimeText(config.model_provider, 120),
    approvalPolicy: sanitizeRuntimeText(stringOrNull(config.approval_policy), 120),
    approvalsReviewer: sanitizeRuntimeText(stringOrNull(config.approvals_reviewer), 120),
    sandboxMode: sanitizeRuntimeText(stringOrNull(config.sandbox_mode), 120),
    reasoningEffort: sanitizeRuntimeText(stringOrNull(config.model_reasoning_effort), 120),
    serviceTier: sanitizeRuntimeText(config.service_tier, 120),
    webSearch: typeof config.web_search === "boolean" ? config.web_search : config.web_search === null ? null : Boolean(config.web_search),
    customGuidanceOmitted: Boolean(config.instructions),
    developerGuidanceOmitted: Boolean(config.developer_instructions),
    compactionGuidanceOmitted: Boolean(config.compact_prompt),
  };
}

export function projectRuntimePermissionProfiles(
  response: v2.PermissionProfileListResponse,
): RuntimePermissionProfileSummary[] {
  return response.data.slice(0, maxItems).map((profile) => ({
    id: sanitizeIdentifier(profile.id, "permission-profile"),
    description: sanitizeRuntimeText(profile.description, 400),
  }));
}

export function projectRuntimeExperimentalFeatures(
  response: v2.ExperimentalFeatureListResponse,
): RuntimeExperimentalFeatureSummary[] {
  return response.data.slice(0, maxItems).map((feature) => ({
    name: sanitizeIdentifier(feature.name, "experimental-feature"),
    stage: sanitizeRuntimeText(feature.stage, 80) ?? "unknown",
    displayName: sanitizeRuntimeText(feature.displayName, 200),
    description: sanitizeRuntimeText(feature.description, 400),
    enabled: feature.enabled,
    defaultEnabled: feature.defaultEnabled,
  }));
}

export function emptyRuntimeConfigPosture(): RuntimeConfigPosture {
  return {
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
  };
}

export function sanitizeRuntimeText(value: string | null | undefined, maxLength = 200): string | null {
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

function sanitizeIdentifier(value: string, fallback: string): string {
  return sanitizeRuntimeText(value, 200) ?? fallback;
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

function emailDomain(email: string): string | null {
  const atIndex = email.lastIndexOf("@");
  if (atIndex < 0 || atIndex === email.length - 1) {
    return null;
  }

  return sanitizeRuntimeText(email.slice(atIndex + 1).toLowerCase(), 200);
}
