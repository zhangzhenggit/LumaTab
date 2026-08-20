import test from "node:test";
import assert from "node:assert/strict";
import { accentFor, monogramFor, normalizeUrl, trimMonogram } from "../src/lib/icons.js";

test("normalizeUrl adds https and preserves valid web URLs", () => {
  assert.equal(normalizeUrl("example.com"), "https://example.com/");
  assert.equal(normalizeUrl("https://example.com/path"), "https://example.com/path");
});

test("normalizeUrl rejects non-web protocols", () => {
  assert.throws(() => normalizeUrl("javascript:alert(1)"), /仅支持/);
});

test("accentFor is deterministic and keyed on the host", () => {
  assert.equal(accentFor("OpenAI", "https://openai.com"), accentFor("OpenAI", "https://openai.com"));
  assert.match(accentFor("OpenAI", "https://openai.com"), /^#[0-9a-f]{6}$/);
  // A rename must not repaint the tile, and www is not a different site.
  assert.equal(accentFor("OpenAI", "https://openai.com/x"), accentFor("ChatGPT", "https://www.openai.com/y"));
});

test("accentFor falls back to the name when the URL cannot be parsed", () => {
  assert.match(accentFor("草稿", "not a url"), /^#[0-9a-f]{6}$/);
});

test("monogramFor takes one or two glyphs from the name", () => {
  assert.equal(monogramFor("AppNew"), "AN");
  assert.equal(monogramFor("code-review"), "CR");
  assert.equal(monogramFor("Grafana Prod"), "GP");
  assert.equal(monogramFor("xcloud"), "XC");
  assert.equal(monogramFor("开发代码"), "开");
  assert.equal(monogramFor("  tbjira"), "TB");
  assert.equal(monogramFor("x"), "X");
  assert.equal(monogramFor(""), "?");
});

test("an explicit monogram overrides the one derived from the name", () => {
  assert.equal(monogramFor("翻译", "译"), "译");
  assert.equal(monogramFor("Grafana Prod", "GF"), "GF");
  // Blank or whitespace-only falls back to the derived value rather than rendering nothing.
  assert.equal(monogramFor("AppNew", ""), "AN");
  assert.equal(monogramFor("AppNew", "   "), "AN");
  // Never more glyphs than the tile is sized for.
  // Clamped to what the tile can still render legibly; the CSS steps the font size down per glyph.
  assert.equal(monogramFor("AppNew", "ABCDEF"), "ABCD");
  assert.equal(trimMonogram("测试文字内容"), "测试文字");
});
