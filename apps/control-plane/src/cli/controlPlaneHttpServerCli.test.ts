import assert from "node:assert/strict";
import test from "node:test";

import { createSafeStartupSummary, loadControlPlaneConfig } from "../config/controlPlaneConfig.ts";

test("control plane cli startup summary should never include raw secrets or upstream urls", () => {
  const config = loadControlPlaneConfig({
    CODEX_REMOTE_CONTROL_PLANE_CONFIG: JSON.stringify({
      publicToken: "example-public-token",
      devices: [
        {
          id: "device-a",
          name: "Device A",
          baseUrl: "http://127.0.0.1:8788",
          token: "example-token",
        },
      ],
    }),
  });

  const summary = createSafeStartupSummary(config);

  assert.match(summary, /device-a/);
  assert.doesNotMatch(summary, /example-public-token|example-token|127\.0\.0\.1:8788|raw|config|stack|cause/);
});
