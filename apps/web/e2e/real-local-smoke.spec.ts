import { expect, test } from "@playwright/test";

const controlPlaneBaseUrl = withoutTrailingSlash(
  process.env.NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_BASE_URL ?? "http://127.0.0.1:8786",
);
const controlPlaneToken =
  process.env.NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_TOKEN ?? process.env.CODEX_REMOTE_LOCAL_TOKEN ?? "example-token";
const preflightTimeoutMs = 10_000;

test("real local stack smoke: should load real Control Plane data and submit through the UI", async ({ page, request }) => {
  const realState = await readRealState(request);
  expect(realState, realState.reason).toEqual({ status: "ready", reason: "ready" });

  const externalRequests = new Set<string>();
  page.on("request", (requestEvent) => {
    const url = new URL(requestEvent.url());
    if (!isLoopbackHost(url.hostname)) {
      externalRequests.add(url.origin);
    }
  });

  await page.goto("/");

  await expect(page.locator(".datasource-status").first()).toContainText("loaded", { timeout: 15_000 });
  await expect(page.getByText("未连接真实 Control Plane")).toHaveCount(0);
  await expect(page.getByText(/示例数据|示例任务数据/)).toHaveCount(0);

  const main = page.getByTestId("main");
  const composer = main.getByRole("textbox", { name: "Follow-up message" });
  await expect(composer).toBeVisible();

  const newConversationMode = main.getByRole("button", { name: "新对话" });
  if ((await newConversationMode.count()) > 0) {
    await newConversationMode.click();
  }
  await composer.fill("codex-remote-calibration web smoke: reply briefly.");

  const startResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/v1/devices/") && response.url().endsWith("/conversations") && response.status() === 202,
  );
  await main.getByRole("button", { name: "发送", exact: true }).click();
  await startResponsePromise;
  if ((await newConversationMode.count()) > 0) {
    await expect(newConversationMode).toHaveAttribute("aria-pressed", "false", { timeout: 10_000 });
  }

  const followUpComposer = page.locator('[contenteditable="true"]').first();
  if ((await followUpComposer.count()) > 0) {
    const sendButton = main.getByRole("button", { name: "发送", exact: true }).first();
    const followUpMode = main.getByText("输入后发送");
    if ((await sendButton.count()) > 0 && (await followUpMode.count()) > 0 && await sendButton.isEnabled()) {
      await followUpComposer.fill("codex-remote-calibration web follow-up: acknowledge briefly.");
      const followUpResponsePromise = page.waitForResponse(
        (response) => response.url().includes("/follow-up") && response.status() === 202,
        { timeout: 20_000 },
      );
      await sendButton.click();
      await followUpResponsePromise;
    }
  }

  expect([...externalRequests]).toEqual([]);
});

async function readRealState(request) {
  const headers = { authorization: `Bearer ${controlPlaneToken}` };
  try {
    const controlPlaneHealth = await request.get(`${controlPlaneBaseUrl}/v1/control-plane/health`, { headers, timeout: preflightTimeoutMs });
    if (!controlPlaneHealth.ok()) {
      return { status: "gap", reason: `real-gap: control-plane health returned ${controlPlaneHealth.status()}` };
    }

    const devicesResponse = await request.get(`${controlPlaneBaseUrl}/v1/devices`, { headers, timeout: preflightTimeoutMs });
    if (!devicesResponse.ok()) {
      return { status: "gap", reason: `real-gap: devices returned ${devicesResponse.status()}` };
    }
    const devices = await devicesResponse.json();
    const deviceId = Array.isArray(devices) && typeof devices[0]?.id === "string" ? devices[0].id : null;
    if (!deviceId) {
      return { status: "gap", reason: "real-gap: no real device returned" };
    }

    const healthResponse = await request.get(
      `${controlPlaneBaseUrl}/v1/devices/${encodeURIComponent(deviceId)}/worker/health`,
      { headers, timeout: preflightTimeoutMs },
    );
    if (!healthResponse.ok()) {
      return { status: "gap", reason: `real-gap: worker health returned ${healthResponse.status()}` };
    }
    const capabilitiesResponse = await request.get(
      `${controlPlaneBaseUrl}/v1/devices/${encodeURIComponent(deviceId)}/worker/capabilities`,
      { headers, timeout: preflightTimeoutMs },
    );
    if (!capabilitiesResponse.ok()) {
      return { status: "gap", reason: `real-gap: worker capabilities returned ${capabilitiesResponse.status()}` };
    }
    const health = await healthResponse.json();
    const capabilities = await capabilitiesResponse.json();
    const healthTransport = normalizeTransport(health?.appServer?.transport);
    const capabilitiesTransport = normalizeTransport(capabilities?.appServerTransport);
    if (health?.appServer?.readyz !== true || healthTransport !== capabilitiesTransport || !isStage9EvidenceTransport(healthTransport)) {
      return { status: "gap", reason: "real-gap: real app-server proof is missing" };
    }

    return { status: "ready", reason: "ready" };
  } catch (error) {
    return { status: "gap", reason: `real-gap: ${error instanceof Error ? error.message : "local preflight failed"}` };
  }
}

function withoutTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function normalizeTransport(value: unknown): string {
  return value === "stdio" || value === "loopbackWebSocket" || value === "unixSocket" ? value : "unknown";
}

function isStage9EvidenceTransport(value: string): boolean {
  return value === "stdio";
}
