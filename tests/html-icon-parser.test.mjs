import assert from "node:assert/strict";
import test from "node:test";
import { pageDeclaredCandidates, sanitizeSvg } from "../src/lib/icon-discovery.js";

test("extracts only icon metadata without constructing a remote DOM", () => {
  const html = `
    <base href="https://cdn.example.com/app/">
    <script src="https://evil.example/script.js"></script>
    <link rel="preload" as="script" href="https://evil.example/preload.js">
    <link rel="stylesheet" href="https://evil.example/styles.css">
    <link rel="icon" type="image/svg+xml" href="icons/app.svg?theme=dark&amp;v=2">
    <link href="icons/app-192.png" sizes="192x192" rel="apple-touch-icon">
    <link rel="manifest" href="manifest.webmanifest">
  `;
  const result = pageDeclaredCandidates(html, "https://example.com/page");
  assert.deepEqual(result.icons, [
    "https://cdn.example.com/app/icons/app.svg?theme=dark&v=2",
    "https://cdn.example.com/app/icons/app-192.png",
  ]);
  assert.equal(result.manifestUrl, "https://cdn.example.com/app/manifest.webmanifest");
  assert.equal(JSON.stringify(result).includes("evil.example"), false);
});

test("rejects HTML pages mislabeled as SVG and strips active SVG content", async () => {
  assert.equal(sanitizeSvg('<html><script src="https://evil.test/app.js"></script><svg><path d="M0 0"/></svg></html>'), null);
  const sanitized = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><style>@import url(https://evil.test/x.css)</style><script src="https://evil.test/x.js"></script><path style="fill:url(https://evil.test/a)" d="M0 0"/></svg>');
  assert.ok(sanitized);
  const text = await sanitized.text();
  assert.equal(/script|style=|onload|evil\.test/i.test(text), false);
  assert.match(text, /<path/);
});

test("new-tab icon client fetches only Chrome's internal favicon endpoint and never parses site HTML", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/lib/site-icon-cache.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /DOMParser/);
  assert.doesNotMatch(source, /response\.text\(/);
  assert.doesNotMatch(source, /fetch\((?:site\.url|pageUrl|https?:)/);
  const fetchCalls = source.match(/fetch\([^\n]+/g) ?? [];
  assert.ok(fetchCalls.length > 0);
  assert.equal(fetchCalls.every((call) => call.includes("chromeFaviconUrl(")), true);
});
