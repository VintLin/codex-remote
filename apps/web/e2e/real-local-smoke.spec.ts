import { expect, test } from "@playwright/test";

const controlPlaneBaseUrl = withoutTrailingSlash(
  process.env.NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_BASE_URL ?? "http://127.0.0.1:8786",
);
const controlPlaneToken =
  process.env.NEXT_PUBLIC_CODEX_REMOTE_CONTROL_PLANE_TOKEN ?? process.env.CODEX_REMOTE_LOCAL_TOKEN ?? "example-token";

test("real local stack smoke: should load real Control Plane data and submit through the UI", async ({ page, request }) => {
  const realState = await readRealState(request);
  test.skip(realState.status !== "ready", realState.reason);

  const externalRequests = new Set<string>();
  page.on("request", (requestEvent) => {
    const url = new URL(requestEvent.url());
    if (!isLoopbackHost(url.hostname)) {
      externalRequests.add(url.origin);
    }
  });

  await page.goto("/");

  await expect(page.getByText("未连接真实 Control Plane")).toHaveCount(0);
  await expect(page.getByText(/示例数据|示例任务数据/)).toHaveCount(0);
  await expect(page.locator(".datasource-status").first()).toContainText("loaded");

  const startInput = page.getByLabel("Start conversation");
  await expect(startInput).toBeVisible();
  await startInput.fill("codex-remote-calibration web smoke: reply briefly.");

  const startResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/v1/devices/") && response.url().endsWith("/conversations") && response.status() === 202,
  );
  await page.getByRole("button", { name: "Start new conversation" }).click();
  await startResponsePromise;
  await expect(page.getByText("accepted").first()).toBeVisible();

  const composer = page.locator('[contenteditable="true"]').first();
  if ((await composer.count()) > 0) {
    await composer.fill("codex-remote-calibration web follow-up: acknowledge briefly.");
    const followUpResponsePromise = page.waitForResponse(
      (response) => response.url().includes("/follow-up") && response.status() === 202,
      { timeout: 10_000 },
    );
    await page.getByRole("button", { name: /send|submit/i }).first().click();
    await followUpResponsePromise;
  }

  expect([...externalRequests]).toEqual([]);
});

async function readRealState(request) {
  const headers = { authorization: `Bearer ${controlPlaneToken}` };
  try {
    const health = await request.get(`${controlPlaneBaseUrl}/v1/control-plane/health`, { headers, timeout: 3_000 });
    if (!health.ok()) {
      return { status: "gap", reason: `real-gap: control-plane health returned ${health.status()}` };
    }

    const devicesResponse = await request.get(`${controlPlaneBaseUrl}/v1/devices`, { headers, timeout: 3_000 });
    if (!devicesResponse.ok()) {
      return { status: "gap", reason: `real-gap: devices returned ${devicesResponse.status()}` };
    }
    const devices = await devicesResponse.json();
    const deviceId = Array.isArray(devices) && typeof devices[0]?.id === "string" ? devices[0].id : null;
    if (!deviceId) {
      return { status: "gap", reason: "real-gap: no real device returned" };
    }

    const proofResponse = await request.get(
      `${controlPlaneBaseUrl}/v1/devices/${encodeURIComponent(deviceId)}/worker/health`,
      { headers, timeout: 3_000 },
    );
    if (!proofResponse.ok()) {
      return { status: "gap", reason: `real-gap: worker proof returned ${proofResponse.status()}` };
    }
    const proof = await proofResponse.json();
    if (
      proof?.appServerConnected !== true ||
      (proof?.transport !== "stdio" && proof?.transport !== "debug-websocket") ||
      typeof proof?.codexVersion !== "string" ||
      typeof proof?.protocolGeneratedAt !== "string"
    ) {
      return { status: "gap", reason: "real-gap: real app-server proof is missing" };
    }

    return { status: "ready", reason: "ready" };
  } catch {
    return { status: "gap", reason: "real-gap: local Control Plane is unavailable" };
  }
}

function withoutTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}
