import type { Device, DeviceConnectionStatus, WorkerHealth } from "@codex-remote/api-contract";

import type { ConfiguredWorkerDevice } from "../config/controlPlaneConfig.ts";

export interface DeviceRegistry {
  list(): readonly ConfiguredWorkerDevice[];
  require(deviceId: string): ConfiguredWorkerDevice;
}

export function createDeviceRegistry(devices: readonly ConfiguredWorkerDevice[]): DeviceRegistry {
  const byId = new Map(devices.map((device) => [device.id, device]));

  return {
    list: () => devices,
    require: (deviceId) => {
      const device = byId.get(deviceId);
      if (!device) {
        throw new Error("device_not_found");
      }
      return device;
    },
  };
}

export function projectDevice(params: {
  configuredDevice: ConfiguredWorkerDevice;
  checkedAt: string;
  health: WorkerHealth | null;
  currentProject?: string;
}): Device {
  const status = getDeviceStatus(params.health);
  return {
    id: params.configuredDevice.id,
    icon: "laptop",
    name: params.configuredDevice.name,
    status,
    ip: getSafeHostLabel(params.configuredDevice.baseUrl),
    lastOnlineAt: params.health?.checkedAt ?? params.checkedAt,
    currentProject: params.currentProject ?? "",
    model: "",
  };
}

function getDeviceStatus(health: WorkerHealth | null): DeviceConnectionStatus {
  if (!health) {
    return "Not connected";
  }

  if (health.status === "connected") {
    return "Connected";
  }

  if (health.status === "degraded") {
    return "Not connected";
  }

  return "Not connected";
}

function getSafeHostLabel(baseUrl: string): string {
  const hostname = new URL(baseUrl).hostname;
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost" ? "local" : "remote";
}
