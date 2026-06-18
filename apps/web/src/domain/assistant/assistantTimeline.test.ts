import assert from "node:assert/strict";
import { readWebSource } from "../../test-support/sourcePaths.ts";
import test from "node:test";

import { classifyLinkTarget } from "./assistantTimeline.ts";

test("when classifying markdown links, should route skill/file/image/url/anchor/unknown targets", () => {
  const skillHref = "/workspace/skills/foo/SKILL.md";

  assert.deepEqual(classifyLinkTarget("Skill", skillHref), {
    type: "skill",
    href: skillHref,
    label: "Skill",
    title: "SKILL.md",
  });
  assert.equal(classifyLinkTarget("Source", "apps/web/src/page.tsx").type, "file");
  assert.equal(classifyLinkTarget("Image", "docs/app-screenshot-light.webp").type, "image");
  assert.equal(classifyLinkTarget("Site", "https://example.com/docs").type, "url");
  assert.equal(classifyLinkTarget("Section", "#architecture").type, "anchor");
  assert.equal(classifyLinkTarget("Unknown", "mailto:hello@example.com").type, "unknown");
});

test("when rendering the assistant thread, should keep assistant-ui runtime and composer primitives", () => {
  const source = readWebSource("components/conversation/codex-assistant-thread.tsx");

  assert.match(source, /AssistantRuntimeProvider/);
  assert.match(source, /useExternalStoreRuntime/);
  assert.match(source, /ComposerPrimitive/);
  assert.match(source, /ThreadPrimitive\.ViewportProvider/);
  assert.doesNotMatch(source, /<ThreadPrimitive\.Viewport[\s>]/);
  assert.doesNotMatch(source, /ComposerPrimitive\.Input/);
  assert.doesNotMatch(source, /<form\b/);
  assert.doesNotMatch(source, /<textarea\b/);
});

test("when rendering the composer access control, should expose the confirmed approval mode menu options", () => {
  const source = readWebSource("components/conversation/codex-assistant-thread.tsx");

  assert.match(source, /const accessModeOptions = \[/);
  assert.match(source, /label: "请求批准"/);
  assert.match(source, /label: "替我审批"/);
  assert.match(source, /label: "完全访问"/);
  assert.match(source, /role="menuitemradio"/);
});
