import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const styles = readFileSync(join(process.cwd(), "../../packages/ui/src/styles.css"), "utf8");

function stripBlock(source: string, selectorPattern: RegExp): string {
  return source.replace(selectorPattern, "");
}

function createAuditedStylesheet(source: string): string {
  let audited = source;
  audited = stripBlock(audited, /@font-face\s*\{[^}]*\}/gs);
  audited = stripBlock(audited, /:root\s*\{[^}]*\}/gs);
  audited = stripBlock(audited, /\.codex-assistant-composer-note\s*\{[^}]*\}/gs);
  return audited;
}

test("when auditing shared visual primitives, should route literal typography, size, and stroke values through tokens except approved specials", () => {
  const audited = createAuditedStylesheet(styles);

  assert.doesNotMatch(audited, /font-size:\s*\d+px;/);
  assert.doesNotMatch(audited, /color:\s*(?:oklch\(|#[0-9A-Fa-f]{3,8}|rgb|rgba|hsl|hsla)/);
  assert.doesNotMatch(audited, /width:\s*\d+px;/);
  assert.doesNotMatch(audited, /height:\s*\d+px;/);
  assert.doesNotMatch(audited, /min-width:\s*\d+px;/);
  assert.doesNotMatch(audited, /max-width:\s*\d+px;/);
  assert.doesNotMatch(audited, /min-height:\s*\d+px;/);
  assert.doesNotMatch(audited, /max-height:\s*\d+px;/);
  assert.doesNotMatch(audited, /border-radius:\s*\d+px;/);
  assert.doesNotMatch(audited, /border(?:-top|-right|-bottom|-left)?:\s*\d+px solid/);
});
