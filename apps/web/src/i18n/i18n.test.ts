import assert from "node:assert/strict";
import test from "node:test";

import { getDictionary } from "./dictionary.ts";
import { defaultLocale, isLocale, normalizeLocale, supportedLocales } from "./locales.ts";

test("locale helpers accept only supported locales", () => {
  assert.deepEqual(supportedLocales, ["zh-CN", "en-US"]);
  assert.equal(defaultLocale, "zh-CN");
  assert.equal(isLocale("zh-CN"), true);
  assert.equal(isLocale("en-US"), true);
  assert.equal(isLocale("fr-FR"), false);
  assert.equal(normalizeLocale("en-US"), "en-US");
  assert.equal(normalizeLocale("fr-FR"), "zh-CN");
});

test("dictionaries keep matching top-level keys", () => {
  assert.deepEqual(Object.keys(getDictionary("en-US")).sort(), Object.keys(getDictionary("zh-CN")).sort());
});
