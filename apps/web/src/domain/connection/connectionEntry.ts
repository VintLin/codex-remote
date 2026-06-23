import type { Device } from "@codex-remote/api-contract";

import type { WebDictionary } from "../../i18n/dictionary.ts";
import { getStatusClassName } from "../status/statusPresentation.ts";

export type ConnectionLoadReason =
  | "loaded"
  | "not_configured"
  | "unauthorized"
  | "forbidden"
  | "app_server_unavailable"
  | "request_failure";

export type ConnectionEntryStatus = "connected" | "connecting" | "failed";
export type ConnectionStepId = "control_center" | "device" | "codex_service" | "workspace";
export type ConnectionStepStatus = "active" | "done" | "failed" | "pending";
export type ConnectionStepDetailStatus = "active" | "done" | "failed" | "pending";

export interface ConnectionStepDetail {
  label: string;
  status: ConnectionStepDetailStatus;
}

export interface ConnectionEntryDevice {
  ariaLabel: string;
  id: string;
  meta: string;
  name: string;
  selected: boolean;
  statusClassName: string;
}

export interface ConnectionEntryStep {
  description: string;
  details: ConnectionStepDetail[];
  id: ConnectionStepId;
  label: string;
  status: ConnectionStepStatus;
}

export interface ConnectionEntryModel {
  devices: ConnectionEntryDevice[];
  failureTitle: string | null;
  status: ConnectionEntryStatus;
  steps: ConnectionEntryStep[];
  summary: string;
  summaryDetails: readonly string[];
  summaryLoading: boolean;
  title: string;
}

interface CreateConnectionEntryModelOptions {
  copy: WebDictionary["connection"];
  devices: Device[];
  errorCode: string | null | undefined;
  errorReason: string | null | undefined;
  isLoading: boolean;
  selectedDeviceId: string | null;
  sourceReason: ConnectionLoadReason;
}

function getConnectionSteps(copy: WebDictionary["connection"]): Array<Omit<ConnectionEntryStep, "status" | "details">> {
  return [
    {
      id: "control_center",
      label: copy.steps.controlCenter,
      description: copy.stepDescriptions.control_center,
    },
    {
      id: "device",
      label: copy.steps.device,
      description: copy.stepDescriptions.device,
    },
    {
      id: "codex_service",
      label: copy.steps.codexService,
      description: copy.stepDescriptions.codex_service,
    },
    {
      id: "workspace",
      label: copy.steps.workspace,
      description: copy.stepDescriptions.workspace,
    },
  ];
}

export function createConnectionEntryModel(options: CreateConnectionEntryModelOptions): ConnectionEntryModel {
  const copy = options.copy;
  const status = resolveConnectionStatus(options);
  const failedStepId = status === "failed" ? resolveFailedStepId(options) : null;

  const steps = createConnectionSteps(copy, status, failedStepId, options.devices.length > 0);

  return {
    devices: createConnectionEntryDevices(copy, options.devices, options.selectedDeviceId, status),
    failureTitle: failedStepId ? resolveFailureTitle(copy, options, failedStepId) : null,
    status,
    steps,
    summary: resolveConnectionSummary(copy, status, steps),
    summaryDetails: resolveConnectionSummaryDetails(copy, status, steps),
    summaryLoading: status === "connecting",
    title: "Codex Remote",
  };
}

function resolveFailureTitle(
  copy: WebDictionary["connection"],
  options: CreateConnectionEntryModelOptions,
  failedStepId: ConnectionStepId,
): string {
  if (options.sourceReason === "not_configured") {
    return copy.failureTitles.not_configured;
  }
  if (options.sourceReason === "unauthorized" || options.sourceReason === "forbidden") {
    return copy.failureTitles.credential_invalid;
  }
  return copy.failureTitles[failedStepId];
}

export function resolveInitialSelectedDeviceId(storedDeviceId: string | null, fallbackDeviceId: string | null): string {
  return storedDeviceId || fallbackDeviceId || "";
}

export function resolveConnectionEntryDevices(devices: Device[], cachedDevices: Device[]): Device[] {
  return devices.length ? devices : cachedDevices;
}

export function shouldPersistSelectedDeviceId(deviceId: string): boolean {
  return deviceId !== "";
}

function resolveConnectionStatus(options: CreateConnectionEntryModelOptions): ConnectionEntryStatus {
  if (options.sourceReason === "loaded") {
    return "connected";
  }
  return options.isLoading ? "connecting" : "failed";
}

function createConnectionEntryDevices(
  copy: WebDictionary["connection"],
  devices: Device[],
  selectedDeviceId: string | null,
  status: ConnectionEntryStatus,
): ConnectionEntryDevice[] {
  if (!devices.length && selectedDeviceId) {
    const meta = createSelectedDeviceMeta(copy, status);
    return [
      {
        ariaLabel: `${selectedDeviceId}，${meta.replace(" · ", "，")}`,
        id: selectedDeviceId,
        meta,
        name: selectedDeviceId,
        selected: true,
        statusClassName: selectedStatusClassName(status),
      },
    ];
  }

  const selectedDevice = selectedDeviceId ? devices.find((device) => device.id === selectedDeviceId) : null;
  const orderedDevices = selectedDevice
    ? [selectedDevice, ...devices.filter((device) => device.id !== selectedDevice.id)]
    : devices;

  return orderedDevices.slice(0, 3).map((device) => {
    const selected = device.id === selectedDevice?.id;
    const meta = createDeviceMeta(copy, device, selected, status);

    return {
      ariaLabel: `${device.name}，${meta.replace(" · ", "，")}`,
      id: device.id,
      meta,
      name: device.name,
      selected,
      statusClassName: selected ? selectedStatusClassName(status) : getStatusClassName(device.status),
    };
  });
}

function createDeviceMeta(
  copy: WebDictionary["connection"],
  device: Device,
  selected: boolean,
  status: ConnectionEntryStatus,
): string {
  if (selected && (status === "connecting" || status === "failed" || status === "connected")) {
    return createSelectedDeviceMeta(copy, status);
  }
  if (device.status === "Connected") {
    return copy.deviceMeta.online;
  }
  return device.lastOnlineAt ? copy.deviceMeta.offlineWithLastSeen(device.lastOnlineAt) : copy.deviceMeta.offline;
}

function createSelectedDeviceMeta(copy: WebDictionary["connection"], status: ConnectionEntryStatus): string {
  if (status === "connecting") {
    return copy.deviceMeta.lastConnecting;
  }
  if (status === "failed") {
    return copy.deviceMeta.lastFailed;
  }
  return copy.deviceMeta.lastConnected;
}

function selectedStatusClassName(status: ConnectionEntryStatus): string {
  if (status === "connecting") {
    return "running";
  }
  if (status === "failed") {
    return "failed";
  }
  return "online";
}

function createConnectionSteps(
  copy: WebDictionary["connection"],
  status: ConnectionEntryStatus,
  failedStepId: ConnectionStepId | null,
  hasDevices: boolean,
): ConnectionEntryStep[] {
  const connectionSteps = getConnectionSteps(copy);
  if (status === "connected") {
    return connectionSteps.map((step) => ({
      ...step,
      details: createConnectionStepDetails(copy, step.id, "done"),
      status: "done",
    }));
  }
  if (status === "connecting") {
    const activeIndex = hasDevices ? 1 : 0;
    return connectionSteps.map((step, index) => {
      const stepStatus = index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
      return {
        ...step,
        details: createConnectionStepDetails(copy, step.id, stepStatus),
        status: stepStatus,
      };
    });
  }

  const failedIndex = connectionSteps.findIndex((step) => step.id === failedStepId);
  return connectionSteps.map((step, index) => {
    const stepStatus = index < failedIndex ? "done" : index === failedIndex ? "failed" : "pending";
    return {
      ...step,
      details: createConnectionStepDetails(copy, step.id, stepStatus),
      status: stepStatus,
    };
  });
}

function createConnectionStepDetails(
  copy: WebDictionary["connection"],
  stepId: ConnectionStepId,
  stepStatus: ConnectionStepStatus,
): ConnectionStepDetail[] {
  const labels = copy.stepDetails[stepId];
  return labels.map((label, index) => ({
    label,
    status: resolveConnectionStepDetailStatus(stepStatus, index, labels.length),
  }));
}

function resolveConnectionStepDetailStatus(
  stepStatus: ConnectionStepStatus,
  index: number,
  count: number,
): ConnectionStepDetailStatus {
  if (stepStatus === "done") {
    return "done";
  }
  if (stepStatus === "pending") {
    return "pending";
  }
  if (stepStatus === "failed") {
    return index === Math.max(0, count - 2) ? "failed" : index < Math.max(0, count - 2) ? "done" : "pending";
  }
  return index === 0 ? "done" : index === 1 ? "active" : "pending";
}

function resolveConnectionSummary(
  copy: WebDictionary["connection"],
  status: ConnectionEntryStatus,
  steps: ConnectionEntryStep[],
): string {
  if (status === "failed") {
    return copy.failedSummary;
  }
  if (status === "connected") {
    return copy.completedSummary;
  }
  const activeStep = steps.find((step) => step.status === "active") ?? steps[0];
  return activeStep ? `${activeStep.label}：${activeStep.description}` : copy.defaultSummary;
}

function resolveConnectionSummaryDetails(
  copy: WebDictionary["connection"],
  status: ConnectionEntryStatus,
  steps: ConnectionEntryStep[],
): readonly string[] {
  if (status === "failed") {
    return [];
  }
  if (status === "connected") {
    return copy.loadingDetails.completed;
  }
  const activeStep = steps.find((step) => step.status === "active") ?? steps[0];
  return activeStep ? copy.loadingDetails[activeStep.id] : [];
}

function resolveFailedStepId(options: CreateConnectionEntryModelOptions): ConnectionStepId {
  if (options.sourceReason === "app_server_unavailable" || options.errorCode === "app_server_unavailable") {
    return "codex_service";
  }
  if (options.errorReason === "request_timeout") {
    return "codex_service";
  }
  if (options.errorCode === "device_unavailable") {
    return "device";
  }
  if (options.errorCode === "timeline_read_error") {
    return "workspace";
  }
  return "control_center";
}
