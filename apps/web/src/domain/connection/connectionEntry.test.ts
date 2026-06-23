import assert from "node:assert/strict";
import test from "node:test";

import type { Device } from "@codex-remote/api-contract";

import { getDictionary } from "../../i18n/dictionary.ts";
import {
  createConnectionEntryModel,
  resolveConnectionEntryDevices,
  resolveInitialSelectedDeviceId,
  shouldPersistSelectedDeviceId,
} from "./connectionEntry.ts";

const devices: Device[] = [
  {
    id: "studio",
    icon: "ST",
    name: "Studio Mini",
    status: "Connected",
    ip: "192.168.1.2",
    lastOnlineAt: "刚刚",
    currentProject: "codex-remote",
    model: "GPT-5",
  },
  {
    id: "macbook",
    icon: "MB",
    name: "MacBook-Pro-4",
    status: "Connected",
    ip: "192.168.1.3",
    lastOnlineAt: "1 分钟前",
    currentProject: "codex-remote",
    model: "GPT-5",
  },
  {
    id: "office",
    icon: "OF",
    name: "Office iMac",
    status: "Not connected",
    ip: "192.168.1.4",
    lastOnlineAt: "09:42",
    currentProject: "",
    model: "",
  },
  {
    id: "lab",
    icon: "LB",
    name: "Lab Mac",
    status: "Connected",
    ip: "192.168.1.5",
    lastOnlineAt: "2 分钟前",
    currentProject: "",
    model: "",
  },
];

const copy = getDictionary("zh-CN").connection;

test("when connecting, should show the selected device first and only expose three devices", () => {
  const model = createConnectionEntryModel({
    copy,
    devices,
    errorCode: null,
    errorReason: null,
    isLoading: true,
    selectedDeviceId: "macbook",
    sourceReason: "not_configured",
  });

  assert.equal(model.status, "connecting");
  assert.deepEqual(model.devices.map((device) => device.id), ["macbook", "studio", "office"]);
  assert.equal(model.devices[0]?.meta, "上次使用 · 正在连接");
  assert.equal(model.devices[0]?.ariaLabel, "MacBook-Pro-4，上次使用，正在连接");
  assert.deepEqual(model.steps.map((step) => step.status), ["done", "active", "pending", "pending"]);
  assert.deepEqual(
    model.steps.map((step) => step.details.map((detail) => detail.label)),
    [
      ["读取连接配置", "校验访问凭证", "读取设备目录"],
      ["查找上次选择的设备", "确认设备在线状态", "保留设备切换入口"],
      ["建立设备连接", "检查本机 Codex 服务响应", "确认当前工作目录可访问"],
      ["读取项目列表", "读取对话列表", "载入当前对话时间线", "准备侧边栏与主内容区"],
    ],
  );
  assert.deepEqual(model.steps[0]?.details.map((detail) => detail.status), ["done", "done", "done"]);
  assert.deepEqual(model.steps[1]?.details.map((detail) => detail.status), ["done", "active", "pending"]);
  assert.deepEqual(model.steps[2]?.details.map((detail) => detail.status), ["pending", "pending", "pending"]);
  assert.equal(model.summary, "连接上次使用的设备：优先连接上次选择的设备；失败时保留设备列表和重试入口。");
  assert.deepEqual(model.summaryDetails, ["恢复上次选择的设备。", "同步设备在线状态，失败时保留切换入口。"]);
  assert.equal(model.summaryLoading, true);
});

test("when connecting before devices are known, should keep the control center step active", () => {
  const model = createConnectionEntryModel({
    copy,
    devices: [],
    errorCode: null,
    errorReason: null,
    isLoading: true,
    selectedDeviceId: "macbook",
    sourceReason: "not_configured",
  });

  assert.deepEqual(model.steps.map((step) => step.status), ["active", "pending", "pending", "pending"]);
});

test("when only the selected device id is known, should still show the attempted device", () => {
  const model = createConnectionEntryModel({
    copy,
    devices: [],
    errorCode: null,
    errorReason: null,
    isLoading: true,
    selectedDeviceId: "local-device",
    sourceReason: "not_configured",
  });

  assert.deepEqual(model.devices, [
    {
      ariaLabel: "local-device，上次使用，正在连接",
      id: "local-device",
      meta: "上次使用 · 正在连接",
      name: "local-device",
      selected: true,
      statusClassName: "running",
    },
  ]);
});

test("when the app-server is unavailable, should fail at the Codex local service step", () => {
  const model = createConnectionEntryModel({
    copy,
    devices,
    errorCode: "app_server_unavailable",
    errorReason: null,
    isLoading: false,
    selectedDeviceId: "macbook",
    sourceReason: "app_server_unavailable",
  });

  assert.equal(model.status, "failed");
  assert.equal(model.failureTitle, "Codex 本机服务未就绪");
  assert.deepEqual(model.steps.map((step) => step.status), ["done", "done", "failed", "pending"]);
});

test("when the connection is not configured, should show the configuration failure at the control center step", () => {
  const model = createConnectionEntryModel({
    copy,
    devices: [],
    errorCode: null,
    errorReason: null,
    isLoading: false,
    selectedDeviceId: null,
    sourceReason: "not_configured",
  });

  assert.equal(model.failureTitle, "未配置连接");
  assert.deepEqual(model.devices, []);
  assert.deepEqual(model.steps.map((step) => step.status), ["failed", "pending", "pending", "pending"]);
});

test("when the control center cannot be reached, should fail at the control center step", () => {
  const model = createConnectionEntryModel({
    copy,
    devices: [],
    errorCode: "request_failure",
    errorReason: "network_error",
    isLoading: false,
    selectedDeviceId: null,
    sourceReason: "request_failure",
  });

  assert.equal(model.failureTitle, "控制中心不可达");
  assert.deepEqual(model.steps.map((step) => step.status), ["failed", "pending", "pending", "pending"]);
});

for (const sourceReason of ["unauthorized", "forbidden"] as const) {
  test(`when the connection credential is ${sourceReason}, should show a credential failure`, () => {
    const model = createConnectionEntryModel({
      copy,
      devices: [],
      errorCode: sourceReason,
      errorReason: null,
      isLoading: false,
      selectedDeviceId: null,
      sourceReason,
    });

    assert.equal(model.failureTitle, "连接凭证无效");
    assert.deepEqual(model.steps.map((step) => step.status), ["failed", "pending", "pending", "pending"]);
  });
}

test("when a request times out after reaching the device, should fail at the Codex local service step", () => {
  const model = createConnectionEntryModel({
    copy,
    devices,
    errorCode: "request_failure",
    errorReason: "request_timeout",
    isLoading: false,
    selectedDeviceId: "macbook",
    sourceReason: "request_failure",
  });

  assert.equal(model.failureTitle, "Codex 本机服务未就绪");
  assert.deepEqual(model.steps.map((step) => step.status), ["done", "done", "failed", "pending"]);
});

test("when a device error is reported, should fail at the device step", () => {
  const model = createConnectionEntryModel({
    copy,
    devices,
    errorCode: "device_unavailable",
    errorReason: null,
    isLoading: false,
    selectedDeviceId: "macbook",
    sourceReason: "request_failure",
  });

  assert.equal(model.failureTitle, "设备不可达");
  assert.deepEqual(model.steps.map((step) => step.status), ["done", "failed", "pending", "pending"]);
});

test("when the timeline cannot be read, should fail at the workspace step", () => {
  const model = createConnectionEntryModel({
    copy,
    devices,
    errorCode: "timeline_read_error",
    errorReason: null,
    isLoading: false,
    selectedDeviceId: "macbook",
    sourceReason: "request_failure",
  });

  assert.equal(model.failureTitle, "对话记录暂不可读");
  assert.deepEqual(model.steps.map((step) => step.status), ["done", "done", "done", "failed"]);
  assert.deepEqual(model.steps[3]?.details.map((detail) => detail.status), ["done", "done", "failed", "pending"]);
});

test("when loaded, should mark every connection step done", () => {
  const model = createConnectionEntryModel({
    copy,
    devices,
    errorCode: null,
    errorReason: null,
    isLoading: false,
    selectedDeviceId: "macbook",
    sourceReason: "loaded",
  });

  assert.equal(model.status, "connected");
  assert.deepEqual(model.steps.map((step) => step.status), ["done", "done", "done", "done"]);
  assert.equal(model.summary, "连接步骤已完成，正在打开工作区。");
  assert.deepEqual(model.summaryDetails, ["设备、本机服务和工作区数据均已就绪。", "即将打开上次使用的主工作区。"]);
  assert.equal(model.summaryLoading, false);
});

test("when restoring device choice, should prefer the stored device before falling back", () => {
  assert.equal(resolveInitialSelectedDeviceId("macbook", "studio"), "macbook");
  assert.equal(resolveInitialSelectedDeviceId(null, "studio"), "studio");
  assert.equal(resolveInitialSelectedDeviceId("", null), "");
  assert.equal(shouldPersistSelectedDeviceId("macbook"), true);
  assert.equal(shouldPersistSelectedDeviceId(""), false);
});

test("when current devices are not loaded yet, should use cached connection devices", () => {
  assert.deepEqual(resolveConnectionEntryDevices([], devices), devices);
  assert.deepEqual(resolveConnectionEntryDevices([devices[0]!], devices), devices.slice(0, 1));
});
