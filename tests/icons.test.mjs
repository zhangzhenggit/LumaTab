import test from "node:test";
import assert from "node:assert/strict";
import { glassTintFor, normalizeUrl, patternFor } from "../src/lib/icons.js";

test("normalizeUrl adds https and preserves valid web URLs", () => {
  assert.equal(normalizeUrl("example.com"), "https://example.com/");
  assert.equal(normalizeUrl("https://example.com/path"), "https://example.com/path");
});

test("normalizeUrl rejects non-web protocols", () => {
  assert.throws(() => normalizeUrl("javascript:alert(1)"), /仅支持/);
});

test("generated icon style is deterministic", () => {
  assert.deepEqual(patternFor("OpenAI", "https://openai.com"), patternFor("OpenAI", "https://openai.com"));
  assert.ok(patternFor("OpenAI", "https://openai.com").variant >= 0);
  assert.equal(patternFor("开发代码", "https://example.com").variant, 0);
  assert.match(glassTintFor("https://example.com"), /^rgba\(/);
});
