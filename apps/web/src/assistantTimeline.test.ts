import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { classifyLinkTarget, deriveAssistantTimeline } from "./assistantTimeline.ts";
import type { AssistantTimelineNode, AssistantToolCallNode } from "./assistantTimeline.ts";
import type { RawCodexThread, RawThreadReadFixture } from "./appServerSnapshotTypes.ts";

test("when raw items interleave text and tools, should preserve text/tool order from raw items", () => {
  const timeline = deriveAssistantTimeline(createSyntheticThread());

  assert.deepEqual(timeline.turns[0]?.nodes.map(summarizeNode), [
    "text:user-a",
    "text:assistant-a",
    "toolGroup:file-a,mcp-a",
    "text:assistant-b",
    "toolCall:mcp-b",
    "text:assistant-c",
  ]);
});

test("when tool-like items are consecutive, should group them and collapse children", () => {
  const timeline = deriveAssistantTimeline(createSyntheticThread());
  const group = timeline.turns[0]?.nodes[2];

  assert.equal(group?.type, "toolGroup");
  assert.equal(group.summary, "已编辑 2 个文件 已运行 1 条命令");
  assert.equal(group.defaultCollapsed, true);
  assert.deepEqual(group.calls.map((child) => `${child.id}:${child.defaultCollapsed}`), ["file-a:true", "mcp-a:true"]);
  assert.deepEqual(group.sourceItemIds, ["file-a", "mcp-a"]);
});

test("when a single tool-like item is isolated, should derive a collapsed toolCall", () => {
  const timeline = deriveAssistantTimeline(createSyntheticThread());
  const toolCall = timeline.turns[0]?.nodes[4];

  assert.equal(toolCall?.type, "toolCall");
  assert.equal(toolCall.defaultCollapsed, true);
  assert.equal(toolCall.label, "已运行 node --test sample.test.ts");
  assert.equal(toolCall.detailPlacement, "inline");
  assert.deepEqual(toolCall.sourceItemIds, ["mcp-b"]);
});

test("when file changes contain a diff, should generate a workspace diff DetailTarget", () => {
  const timeline = deriveAssistantTimeline(createSyntheticThread());
  const group = timeline.turns[0]?.nodes[2];
  assert.equal(group?.type, "toolGroup");
  const fileChange = group.calls[0];

  assert.equal(fileChange?.type, "toolCall");
  assert.equal(fileChange.kind, "fileChange");
  assert.equal(fileChange.detailPlacement, "workspace");
  assert.equal(fileChange.detailTarget.type, "diff");
  assert.equal(fileChange.detailTarget.title, "已编辑 2 个文件");
  assert.equal(fileChange.detailTarget.changes.length, 2);
  assert.deepEqual(
    fileChange.detailTarget.changes.map((change) => change.path),
    ["/tmp/sample.ts", "/tmp/second.ts"],
  );
});

test("when raw turn includes timing, should pass timing fields into timeline turn", () => {
  const timeline = deriveAssistantTimeline(createSyntheticThread());
  const turn = timeline.turns[0];

  assert.equal(turn?.startedAt, 1_700_000_000_000);
  assert.equal(turn.completedAt, 1_700_000_001_250);
  assert.equal(turn.durationMs, 1_250);
});

test("when classifying markdown links, should route skill/file/image/url/anchor/unknown targets", () => {
  const skillHref = "/Users/Vint/.skillflow/source/git/foo/SKILL.md";

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

test("when deriving from real fixture, should preserve turnId and sourceItemIds for every node", () => {
  const fixture = readThreadReadFixture();
  const thread = Object.values(fixture.threads).find((result) => (result.thread?.turns ?? []).length > 0)?.thread;
  assert.ok(thread);

  const timeline = deriveAssistantTimeline(thread);
  const nodes = timeline.turns.flatMap((turn) => turn.nodes);
  assert.ok(nodes.length > 0);

  for (const node of nodes) {
    assert.ok(node.turnId.length > 0, `missing turnId for ${node.id}`);
    assert.ok(node.sourceItemIds.length > 0, `missing sourceItemIds for ${node.id}`);
    if (node.type === "toolGroup") {
      for (const child of node.calls) {
        assert.ok(child.turnId.length > 0, `missing child turnId for ${child.id}`);
        assert.ok(child.sourceItemIds.length > 0, `missing child sourceItemIds for ${child.id}`);
      }
    }
  }
});

function summarizeNode(node: AssistantTimelineNode): string {
  if (node.type === "text") {
    return `text:${node.id}`;
  }

  if (node.type === "toolGroup") {
    return `toolGroup:${node.calls.map((child) => child.id).join(",")}`;
  }

  return `toolCall:${node.id}`;
}

function createSyntheticThread(): RawCodexThread {
  return {
    id: "thread-a",
    turns: [
      {
        id: "turn-a",
        status: "complete",
        startedAt: 1_700_000_000_000,
        completedAt: 1_700_000_001_250,
        durationMs: 1_250,
        items: [
          { type: "userMessage", id: "user-a", text: "Prompt" },
          { type: "agentMessage", id: "assistant-a", text: "Assistant A" },
          {
            type: "fileChange",
            id: "file-a",
            changes: [
              {
                path: "/tmp/sample.ts",
                kind: { type: "modify" },
                diff: "@@ -1 +1 @@\n-old\n+new\n",
              },
              {
                path: "/tmp/second.ts",
                kind: "add",
                diff: "@@ -0,0 +1 @@\n+second\n",
              },
            ],
          },
          {
            type: "mcpToolCall",
            id: "mcp-a",
            arguments: { cmd: "pnpm test" },
            status: "success",
          },
          { type: "agentMessage", id: "assistant-b", text: "Assistant B" },
          {
            type: "mcpToolCall",
            id: "mcp-b",
            arguments: { cmd: "node --test sample.test.ts" },
            status: "complete",
          },
          { type: "agentMessage", id: "assistant-c", text: "Assistant C" },
        ],
      },
    ],
  };
}

function readThreadReadFixture(): RawThreadReadFixture {
  const fixturePath = join(process.cwd(), "src/fixtures/app-server/050_codex_remote.thread-read.json");
  return JSON.parse(readFileSync(fixturePath, "utf8")) as RawThreadReadFixture;
}

function assertToolCall(node: AssistantTimelineNode | undefined): asserts node is AssistantToolCallNode {
  assert.equal(node?.type, "toolCall");
}
