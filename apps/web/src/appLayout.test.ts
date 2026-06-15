import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { appPanelLayout } from "./appLayout.ts";

test("when workspace panels are configured, should expose the confirmed resize constraints", () => {
  assert.deepEqual(appPanelLayout.left, {
    id: "left",
    defaultSize: 280,
    minSize: 220,
    collapsedSize: 0,
  });
  assert.deepEqual(appPanelLayout.main, {
    id: "main",
    minSize: 520,
  });
  assert.deepEqual(appPanelLayout.right, {
    id: "right",
    defaultSize: 380,
    minSize: 300,
    maxSize: 560,
    collapsedSize: 0,
  });
});

test("when viewport is narrow, should keep the review pane in the same horizontal workspace", () => {
  const styles = readFileSync(join(process.cwd(), "../../packages/ui/src/styles.css"), "utf8");

  assert.equal(styles.includes("grid-column: 2"), false);
  assert.equal(/\.app-shell\s*\{[^}]*display:\s*block/s.test(styles), false);
});
