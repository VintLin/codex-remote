import type { Device } from "@codex-remote/api-contract";

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
  title: string;
}

interface CreateConnectionEntryModelOptions {
  devices: Device[];
  errorCode: string | null | undefined;
  isLoading: boolean;
  selectedDeviceId: string | null;
  sourceReason: ConnectionLoadReason;
}

const connectionSteps: Array<Omit<ConnectionEntryStep, "status">> = [
  {
    id: "control_center",
    label: "连接控制中心",
    description: "确认当前 Web 可以访问控制中心。",
  },
  {
    id: "device",
    label: "连接上次使用的设备",
    description: "优先连接上次选择的设备；失败时保留设备列表和重试入口。",
  },
  {
    id: "codex_service",
    label: "启动 Codex 本机服务",
    description: "设备连接后检查 Codex 本机服务是否可用。",
  },
  {
    id: "workspace",
    label: "载入对话记录与工作区",
    description: "成功后展开侧边栏，并显示正确的主内容区域。",
  },
];

const failureTitles = {
  control_center: "控制中心不可达",
  device: "设备不可达",
  codex_service: "Codex 本机服务未就绪",
  workspace: "对话记录暂不可读",
} satisfies Record<ConnectionStepId, string>;

export function createConnectionEntryModel(options: CreateConnectionEntryModelOptions): ConnectionEntryModel {
  const status = resolveConnectionStatus(options);
  const failedStepId = status === "failed" ? resolveFailedStepId(options) : null;

  return {
    devices: createConnectionEntryDevices(options.devices, options.selectedDeviceId, status),
    failureTitle: failedStepId ? failureTitles[failedStepId] : null,
    status,
    steps: createConnectionSteps(status, failedStepId, options.devices.length > 0),
    summary: status === "failed"
      ? "连接未完成。检查当前步骤后可重试连接。"
      : "正在恢复上次选择的设备，并准备对话记录与工作区内容。",
    title: "Codex Remote",
  };
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
  devices: Device[],
  selectedDeviceId: string | null,
  status: ConnectionEntryStatus,
): ConnectionEntryDevice[] {
  if (!devices.length && selectedDeviceId) {
    const meta = createSelectedDeviceMeta(status);
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
    const meta = createDeviceMeta(device, selected, status);

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

function createDeviceMeta(device: Device, selected: boolean, status: ConnectionEntryStatus): string {
  if (selected && status === "connecting") {
    return createSelectedDeviceMeta(status);
  }
  if (selected && status === "failed") {
    return createSelectedDeviceMeta(status);
  }
  if (selected && status === "connected") {
    return createSelectedDeviceMeta(status);
  }
  if (device.status === "Connected") {
    return "在线 · 可切换";
  }
  return device.lastOnlineAt ? `离线 · 上次 ${device.lastOnlineAt}` : "离线";
}

function createSelectedDeviceMeta(status: ConnectionEntryStatus): string {
  if (status === "connecting") {
    return "上次使用 · 正在连接";
  }
  if (status === "failed") {
    return "上次使用 · 连接失败";
  }
  return "上次使用 · 已连接";
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
  status: ConnectionEntryStatus,
  failedStepId: ConnectionStepId | null,
  hasDevices: boolean,
): ConnectionEntryStep[] {
  if (status === "connected") {
    return connectionSteps.map((step) => ({ ...step, status: "done" }));
  }
  if (status === "connecting") {
    const activeIndex = hasDevices ? 1 : 0;
    return connectionSteps.map((step, index) => ({
      ...step,
      status: index < activeIndex ? "done" : index === activeIndex ? "active" : "pending",
    }));
  }

  const failedIndex = connectionSteps.findIndex((step) => step.id === failedStepId);
  return connectionSteps.map((step, index) => ({
    ...step,
    status: index < failedIndex ? "done" : index === failedIndex ? "failed" : "pending",
  }));
}

function resolveFailedStepId(options: CreateConnectionEntryModelOptions): ConnectionStepId {
  if (options.sourceReason === "app_server_unavailable" || options.errorCode === "app_server_unavailable") {
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
