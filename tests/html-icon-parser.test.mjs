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
  assert.deepEqual(result.faviconIcons, ["https://cdn.example.com/app/icons/app.svg?theme=dark&v=2"]);
  assert.deepEqual(result.appleTouchIcons, ["https://cdn.example.com/app/icons/app-192.png"]);
  assert.equal(result.manifestUrl, "https://cdn.example.com/app/manifest.webmanifest");
  assert.equal(JSON.stringify(result).includes("evil.example"), false);
});

test("rejects HTML pages mislabeled as SVG and strips active SVG content", async () => {
  assert.equal(sanitizeSvg('<html><script src="https://evil.test/app.js"></script><svg><path d="M0 0"/></svg></html>'), null);
  const sanitized = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><style>@import url(https://evil.test/x.css); .a{fill:#0a0}</style><script src="https://evil.test/x.js"></script><path style="fill:url(https://evil.test/a)" d="M0 0"/></svg>');
  assert.ok(sanitized);
  const text = await sanitized.text();
  // The real invariants: no script, no event handlers, no reference that reaches the network.
  // Browsers disable scripting entirely for SVG rendered as an image, so declarations themselves
  // are inert — and stripping them wholesale is what left icons that parsed fine but painted
  // nothing, because plenty of favicons set `fill:none` on shapes and colour them from CSS.
  assert.equal(/<script|onload|evil\.test|@import/i.test(text), false);
  assert.match(text, /<path/);
  assert.match(text, /fill:#0a0/, "styling that makes the icon visible must survive");
});

test("new-tab icon client issues no network requests of its own", async () => {
  // The extension document must never fetch a remote resource: that exposes it to preload
  // headers and to HTML disguised as an icon. All fetching lives in the service worker, and the
  // page only reads verified blobs back out of Cache Storage. This rule used to carve out one
  // exception for Chrome's own favicon endpoint; that moved into the worker too, so the
  // invariant is now absolute.
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/lib/site-icon-cache.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /DOMParser/);
  assert.doesNotMatch(source, /response\.text\(/);
  assert.equal(source.match(/[^.\w]fetch\(/g), null);
});

test("wallpaper cache identity is shared between worker and page, not redeclared", async () => {
  const read = async (path) => (await import("node:fs/promises")).readFile(new URL(path, import.meta.url), "utf8");
  // Both sides must derive the cache key from one module. When these were separate string
  // literals, changing one silently pointed the page at an empty cache — the same class of bug
  // that once broke every site icon.
  for (const path of ["../src/background/service-worker.js", "../src/lib/background.js"]) {
    const source = await read(path);
    assert.match(source, /background-cache-keys\.js"/);
    assert.doesNotMatch(source, /"lumatab-background-v\d"/);
  }
});

test("SVG icons survive verification instead of being silently dropped", async () => {
  const read = async (p) => (await import("node:fs/promises")).readFile(new URL(p, import.meta.url), "utf8");
  const worker = await read("../src/background/service-worker.js");
  // createImageBitmap cannot decode SVG in Chrome, and a service worker has no DOM to rasterise
  // one with, so running vectors through analyzeIconBlob rejected EVERY svg favicon — a large
  // share of modern sites, smallpdf among them. SVG must be verified structurally instead.
  const start = worker.indexOf("type.includes(\"svg\")");
  const raw = worker.slice(start, start + worker.slice(start).indexOf("\n}"));
  // Strip comments: this very file explains the bug by name, and prose must not satisfy a
  // structural assertion about the code.
  const code = raw.split(/\r?\n/).filter((line) => !line.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(code, /analyzeIconBlob/);
  assert.match(code, /nativeSize: 0/);
});

test("a viewBox-only SVG is given an intrinsic size", async () => {
  const { sanitizeSvg } = await import("../src/lib/icon-discovery.js");
  const sized = await sanitizeSvg('<svg viewBox="0 0 96 96"><path d="M0 0h9v9z"/></svg>').text();
  assert.match(sized, /<svg width="96" height="96"/);
  // An explicit size is never overwritten.
  const kept = await sanitizeSvg('<svg width="32" height="32" viewBox="0 0 64 64"><path d="M0 0h9v9z"/></svg>').text();
  assert.match(kept, /^<svg width="32" height="32"/);
});

test("source files carry no stray control characters", async () => {
  // A shell-escaped edit once wrote a literal backspace into a regex (`/<svg\bx08.../`), which
  // matched nothing and disabled the code silently. Control characters are never intentional.
  const { readdir, readFile } = await import("node:fs/promises");
  const dirs = ["../src/lib", "../src/components", "../src/hooks", "../src/background"];
  for (const dir of dirs) {
    for (const name of await readdir(new URL(dir, import.meta.url))) {
      if (!/\.(js|jsx)$/.test(name)) continue;
      const text = await readFile(new URL(`${dir}/${name}`, import.meta.url), "utf8");
      // eslint-disable-next-line no-control-regex
      assert.equal(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text), false, `${name} contains a control character`);
    }
  }
});
