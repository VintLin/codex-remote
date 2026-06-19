import assert from "node:assert/strict";
import test from "node:test";

import { readWebSource } from "../../test-support/sourcePaths.ts";

test("codex remote app when follow-up submit is wired, should call Worker API and refresh selected conversation", () => {
  const shellSource = readWebSource("components/shell/codex-remote-app.tsx");
  const controllerSource = readWebSource("components/shell/followUpSubmitController.ts");

  assert.match(shellSource, /new WorkerApiClient/);
  assert.match(shellSource, /submitConversationFollowUp/);
  assert.match(shellSource, /crypto\.randomUUID/);
  assert.match(shellSource, /loadWorkbenchData/);
  assert.match(shellSource, /setWorkbenchData/);
  assert.match(controllerSource, /followUpConversation/);
  assert.match(controllerSource, /clientRequestId/);
  assert.match(controllerSource, /expectedConversationId/);
  assert.doesNotMatch(`${shellSource}\n${controllerSource}`, /StartConversationInput|startConversation/);
});
