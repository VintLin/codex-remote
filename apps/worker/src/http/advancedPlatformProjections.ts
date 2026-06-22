import type {
  AdvancedPlatformReadinessSection,
  AdvancedPlatformWatchlistItem,
  ErrorEnvelope,
} from "@codex-remote/api-contract";
import type { v2 } from "@codex-remote/codex-protocol";

export type AdvancedPlatformPublicPlatform = "macos" | "windows" | "linux" | "unknown";

const windowsSandboxSectionBase = {
  id: "windows-sandbox",
  label: "Windows sandbox",
} as const;

export function projectWindowsSandboxReadinessSection(
  platform: AdvancedPlatformPublicPlatform,
  response: v2.WindowsSandboxReadinessResponse,
): AdvancedPlatformReadinessSection {
  if (platform !== "windows") {
    return {
      ...windowsSandboxSectionBase,
      status: "not_applicable",
      summary: "Windows sandbox is not applicable on this platform.",
      details: "This device is not running Windows.",
    };
  }

  switch (response.status) {
    case "ready":
      return {
        ...windowsSandboxSectionBase,
        status: "ready",
        summary: "Windows sandbox is ready.",
        details: "Codex can use the Windows sandbox on this device.",
      };
    case "notConfigured":
      return {
        ...windowsSandboxSectionBase,
        status: "unavailable",
        summary: "Windows sandbox is not configured.",
        details: "Configuration is deferred until a Windows-specific safety flow exists.",
      };
    case "updateRequired":
      return {
        ...windowsSandboxSectionBase,
        status: "unavailable",
        summary: "Windows sandbox requires an update.",
        details: "Update handling is deferred until a Windows-specific safety flow exists.",
      };
  }
}

export function projectWindowsSandboxReadinessUnavailableSection(
  error: ErrorEnvelope,
): AdvancedPlatformReadinessSection {
  return {
    ...windowsSandboxSectionBase,
    status: "degraded",
    summary: "Windows sandbox readiness could not be checked.",
    details: "The app-server readiness check failed; no setup action was attempted.",
    error: sanitizeSectionError(error),
  };
}

export function createAdvancedPlatformWatchlistItems(): AdvancedPlatformWatchlistItem[] {
  return [
    {
      id: "realtime-voice",
      label: "Realtime voice",
      support: "deferred",
      reason: "Voice transport, audio privacy, and close/error handling need a separate safety design.",
      nextSafeStep: "Define a read-only protocol and privacy model first.",
    },
    {
      id: "feedback-upload",
      label: "Feedback upload",
      support: "deferred",
      reason: "Upload scope and log scrubbing are not proven in this product boundary.",
      nextSafeStep: "Design a local confirmation and redaction model first.",
    },
    {
      id: "external-agent-config",
      label: "External agent config",
      support: "deferred",
      reason: "Home and repo scanning can reveal private configuration.",
      nextSafeStep: "Start with a reviewed read-only detection design.",
    },
    {
      id: "remote-gui-computer-use",
      label: "Remote GUI and computer use",
      support: "not_supported",
      reason: "Browser, desktop, and extension control are outside this read-only readiness slice.",
      nextSafeStep: "Keep this disabled until a dedicated security model exists.",
    },
    {
      id: "automations",
      label: "Automations",
      support: "deferred",
      reason: "Recurring tasks and wakeups need separate scheduling and consent rules.",
      nextSafeStep: "Specify automation ownership and cancellation semantics first.",
    },
  ];
}

function sanitizeSectionError(error: ErrorEnvelope): ErrorEnvelope {
  if (isSafeErrorMessage(error.message)) {
    return error;
  }

  return {
    code: error.code,
    message: "Worker request failed.",
    ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
    ...(error.details ? { details: error.details } : {}),
  };
}

function isSafeErrorMessage(value: string): boolean {
  return ![
    /https?:\/\//i,
    /wss?:\/\//i,
    /\btoken\b/i,
    /\bsecret\b/i,
    /\bstack\b/i,
    /\bcause\b/i,
    /\bprompt\b/i,
    /\blog\b/i,
    /\bcommand output\b/i,
    /\bdiff --git\b/i,
    /\bmigrationItems\b/i,
    /\bjsonrpc\b/i,
    /(?:^|[^\w])\/Users\//,
    /(?:^|[^\w])\/private\//,
    /\bHOSTNAME=/i,
    /\bUSER=/i,
    /\bprocess\.env\b/i,
  ].some((pattern) => pattern.test(value));
}
