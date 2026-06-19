import assert from "node:assert/strict";
import test from "node:test";

import { submitFollowUpDraft } from "./followUpComposerSubmit.ts";

test("submitFollowUpDraft when submit succeeds, should clear draft after refresh completes", async () => {
  const events: string[] = [];

  const result = await submitFollowUpDraft({
    canSend: true,
    message: "Continue safely",
    onClearDraft: () => events.push("clear"),
    onSubmitFollowUp: async (message) => {
      events.push(`submit:${message}`);
      events.push("refresh");
    },
  });

  assert.equal(result, "accepted");
  assert.deepEqual(events, ["submit:Continue safely", "refresh", "clear"]);
});

test("submitFollowUpDraft when submit fails, should preserve draft and not rethrow raw error", async () => {
  const events: string[] = [];

  const result = await submitFollowUpDraft({
    canSend: true,
    message: "Continue safely",
    onClearDraft: () => events.push("clear"),
    onSubmitFollowUp: async () => {
      events.push("submit");
      throw new Error("raw worker url and stack should not escape");
    },
  });

  assert.equal(result, "failed");
  assert.deepEqual(events, ["submit"]);
});

test("submitFollowUpDraft when submit returns failed, should preserve draft", async () => {
  const events: string[] = [];

  const result = await submitFollowUpDraft({
    canSend: true,
    message: "smoke-fail",
    onClearDraft: () => events.push("clear"),
    onSubmitFollowUp: async () => {
      events.push("submit");
      return "failed";
    },
  });

  assert.equal(result, "failed");
  assert.deepEqual(events, ["submit"]);
});

test("submitFollowUpDraft when submit returns accepted, should clear draft", async () => {
  const events: string[] = [];

  const result = await submitFollowUpDraft({
    canSend: true,
    message: "Continue safely",
    onClearDraft: () => events.push("clear"),
    onSubmitFollowUp: async () => {
      events.push("submit");
      return "accepted";
    },
  });

  assert.equal(result, "accepted");
  assert.deepEqual(events, ["submit", "clear"]);
});

test("submitFollowUpDraft when send is disabled, should not submit or clear", async () => {
  const events: string[] = [];

  const result = await submitFollowUpDraft({
    canSend: false,
    message: "Continue safely",
    onClearDraft: () => events.push("clear"),
    onSubmitFollowUp: async () => {
      events.push("submit");
    },
  });

  assert.equal(result, "skipped");
  assert.deepEqual(events, []);
});
