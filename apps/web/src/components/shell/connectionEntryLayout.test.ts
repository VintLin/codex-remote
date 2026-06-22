import assert from "node:assert/strict";
import test from "node:test";

import { readWebSource, readWorkspaceSource } from "../../test-support/sourcePaths.ts";

const appComponent = readWebSource("components/shell/codex-remote-app.tsx");
const connectionEntryComponent = readWebSource("components/shell/connection-entry.tsx");
const styles = readWorkspaceSource("packages/ui/src/styles.css");

test("when the workbench is not connected, should render the unified connection entry model", () => {
  assert.match(appComponent, /createConnectionEntryModel/);
  assert.match(appComponent, /connectionEntryModel\.status !== "connected"/);
  assert.match(appComponent, /<ConnectionEntry/);
  assert.match(connectionEntryComponent, /model: ConnectionEntryModel/);
  assert.match(connectionEntryComponent, /onRetry: \(\) => void/);
  assert.match(connectionEntryComponent, /model\.devices\.slice\(0, 3\)/);
});

test("when selecting devices, should persist the last selected device for the next entry load", () => {
  assert.match(appComponent, /selectedDeviceStorageKey = "codex-remote:selected-device-id"/);
  assert.match(appComponent, /resolveInitialSelectedDeviceId\(null, workbenchData\.devices\[0\]\?\.id \?\? null\)/);
  assert.match(appComponent, /const storedDeviceId = readStoredSelectedDeviceId\(\)/);
  assert.match(appComponent, /shouldPersistSelectedDeviceId\(selectedDeviceId\)/);
});

test("when the connection entry is waiting on the full workbench, should still prefetch and reuse devices", () => {
  assert.match(appComponent, /cachedConnectionDevices/);
  assert.match(appComponent, /workerClient\.listDevices\(\)/);
  assert.match(appComponent, /resolveConnectionEntryDevices\(devices, cachedConnectionDevices\)/);
});

test("when connection entry styles are rendered, should use existing design tokens", () => {
  assert.match(styles, /\.connection-entry-shell\s*\{[^}]*background:\s*var\(--cr-bg\);/s);
  assert.match(styles, /\.connection-entry-device\s*\{[^}]*font-size:\s*var\(--cr-text-body\);/s);
  assert.match(styles, /\.connection-entry-step-title\s*\{[^}]*font-weight:\s*var\(--cr-weight-emphasis\);/s);
  assert.doesNotMatch(connectionEntryComponent, /Control Plane|Worker|runtime|JSON-RPC|app-server/);
});
