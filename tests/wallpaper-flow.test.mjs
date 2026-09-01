import test from "node:test";
import assert from "node:assert/strict";

// Drives the real service-worker module against a stubbed chrome API, so the wallpaper
// message contract is verified end to end instead of by reading the code.
function installChromeStub() {
  const store = {};
  const listeners = [];
  globalThis.chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://test${path}`,
      onInstalled: { addListener() {} },
      onMessage: { addListener: (fn) => listeners.push(fn) },
      sendMessage: async () => {},
      getPlatformInfo: async () => ({}),
    },
    storage: {
      local: {
        get: async (key) => (key in store ? { [key]: store[key] } : {}),
        set: async (obj) => Object.assign(store, obj),
        remove: async () => {},
      },
    },
    // Site access is an optional permission; the worker asks about it before probing any site
    // and listens for it being granted. Denied here, which is the state a fresh install is in.
    permissions: {
      contains: async () => false,
      onAdded: { addListener() {} },
    },
  };
  globalThis.caches = {
    open: async () => ({ match: async () => null, put: async () => {}, keys: async () => [] }),
    keys: async () => [],
  };
  return {
    store,
    send: (message) => new Promise((resolve) => {
      for (const fn of listeners) if (fn(message, {}, resolve)) return;
      resolve(null);
    }),
  };
}

const chromeStub = installChromeStub();
const { BACKGROUND_META_KEY, GRADIENTS } = await import("../src/lib/background-cache-keys.js");
await import("../src/background/service-worker.js");

test("choosing a gradient stores it and reports it back", async () => {
  chromeStub.store[BACKGROUND_META_KEY] = {
    images: [{ startDate: "20260818", urlbase: "/a", imageUrl: "https://www.bing.com/th?id=a" }],
    selectedIndex: 0,
    fetchedAt: Date.now(),
  };
  const key = GRADIENTS[0].key;

  const library = await chromeStub.send({ type: "LUMATAB_SET_WALLPAPER", gradientKey: key });
  assert.equal(library?.gradientKey, key, "settings panel never sees the gradient as selected");
  assert.equal(chromeStub.store[BACKGROUND_META_KEY].gradientKey, key, "gradient was not persisted");

  const background = await chromeStub.send({ type: "LUMATAB_GET_BING_BACKGROUND" });
  assert.equal(background?.meta?.gradientKey, key, "the page is never told to paint the gradient");
});

test("choosing a photo clears an active gradient", async () => {
  const library = await chromeStub.send({ type: "LUMATAB_SET_WALLPAPER", mode: "auto", key: null });
  assert.equal(library?.gradientKey, null);
});

test("the page turns the worker's gradient reply into paintable CSS", async () => {
  const key = GRADIENTS[2].key;
  // Stand in for the worker: reply exactly as it does for an active gradient.
  globalThis.chrome.runtime.sendMessage = async (message) => (
    message.type === "LUMATAB_GET_BING_BACKGROUND"
      ? { status: "gradient", cacheUrl: null, meta: { gradientKey: key, mask: 10, blur: 0 } }
      : null
  );
  const { loadBingBackground } = await import("../src/lib/background.js");
  const result = await loadBingBackground();
  assert.match(result.gradient ?? "", /^linear-gradient/, "gradient never reaches the wallpaper element");
  assert.equal(result.url, null);
});

test("icon resolution reports progress while it runs, not only at the end", async () => {
  const source = await (await import("node:fs/promises"))
    .readFile(new URL("../src/background/service-worker.js", import.meta.url), "utf8");
  // A 50-site batch takes long enough that MV3 can recycle the worker before it finishes.
  // Announcing only on completion meant the page showed nothing for the whole run and often
  // never heard anything at all, so the user had to reload the tab to see cached icons.
  assert.match(source, /progress\.report\(\)/, "resolved icons are never announced mid-batch");
  assert.match(source, /partial: true/, "progress broadcasts carry no partial marker");
});

test("the settings launcher keeps its styles", async () => {
  const css = await (await import("node:fs/promises"))
    .readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  // Right-click is the browser's again, so this button is the only way into settings; it was
  // once deleted along with a neighbouring block and left invisible but still in the DOM.
  assert.match(css, /\.settings-launcher\s*\{/);
  assert.match(css, /\.settings-launcher:hover/);
  // The permission prompt falls into the same trap: it is the only place the grant is offered
  // outside Settings, and a quietly deleted rule leaves it in the DOM but invisible.
  assert.match(css, /\.site-access\s*\{/);
  assert.match(css, /\.site-access__grant\s*\{/);
});

test("tiles keep Apple's squircle geometry", async () => {
  const css = await (await import("node:fs/promises"))
    .readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  // 22.37% of the 60px tile. A radius alone is a rounded rectangle; the corner-shape is what
  // makes it a superellipse, and Chromium below 139 drops that line silently — so if either half
  // goes missing the tiles quietly regress to the old look with nothing failing.
  assert.match(css, /--icon-radius:\s*13\.4px/);
  assert.match(css, /--icon-corner:\s*superellipse\(2\.5\)/);
  assert.match(css, /corner-shape:\s*var\(--icon-corner\)/);
});

test("switching to auto keeps the current picture and only follows Bing from the next rotation", async () => {
  const images = [
    { startDate: "20260818", urlbase: "/a", imageUrl: "https://www.bing.com/th?id=a" },
    { startDate: "20260814", urlbase: "/b", imageUrl: "https://www.bing.com/th?id=b" },
  ];
  chromeStub.store[BACKGROUND_META_KEY] = { images, selectedIndex: 0, fetchedAt: Date.now() };

  await chromeStub.send({ type: "LUMATAB_SET_WALLPAPER", mode: "pinned", key: "20260814" });
  const back = await chromeStub.send({ type: "LUMATAB_SET_WALLPAPER", mode: "auto", key: null });
  // The chosen photo must survive the switch; "update daily" is a statement about future
  // updates, not a command to change the wallpaper this instant.
  assert.equal(back?.activeKey, "20260814", "auto mode yanked the wallpaper the user had chosen");
  assert.equal(back?.mode, "auto");
});

// `auto: true` on a plain tuning message only *preserves* the stored brightnessAuto flag — it
// never sets it. That is correct for storeAutoBrightness (the page reporting a value it derived
// on its own must not look like a user decision), but it means nothing on that path could ever
// turn automatic tone matching back on once a manual slider drag had switched it off. Reset needs
// its own flag for exactly that reason, and this pins the case that would otherwise regress: a
// user with a hand-set brightness clicking reset, expecting to actually get automatic mode back.
test("reset turns automatic tone matching back on even after a manual brightness was set", async () => {
  chromeStub.store[BACKGROUND_META_KEY] = {
    images: [{ startDate: "20260818", urlbase: "/a", imageUrl: "https://www.bing.com/th?id=a" }],
    selectedIndex: 0,
    fetchedAt: Date.now(),
  };

  const manual = await chromeStub.send({ type: "LUMATAB_SET_WALLPAPER", brightness: 82 });
  assert.equal(manual?.brightnessAuto, false, "a manual brightness must end auto mode");

  // The bug this guards against: reporting a value as if the page had derived it does not revive
  // auto mode, because `auto: true` here only preserves whatever brightnessAuto already was.
  const stillOff = await chromeStub.send({ type: "LUMATAB_SET_WALLPAPER", brightness: 55, auto: true });
  assert.equal(stillOff?.brightnessAuto, false, "auto:true on a tuning message must not resurrect auto mode");

  const reset = await chromeStub.send({ type: "LUMATAB_SET_WALLPAPER", reset: true });
  assert.equal(reset?.brightness, 60, "reset must restore the default brightness");
  assert.equal(reset?.blur, 10, "reset must restore the default blur");
  assert.equal(reset?.brightnessAuto, true, "reset is the one path that must turn auto mode back on");
  assert.equal(chromeStub.store[BACKGROUND_META_KEY].brightnessAuto, true, "the reset must be persisted");
});

// Two attempts at an ambient wallpaper pan shipped as a CSS animation, and both were reported as
// a jump or a flash on returning to the tab. The cause is structural: a CSS animation's timeline
// keeps advancing while a tab is hidden even though nothing is painted, and the usual guard —
// toggling `animation-play-state` from `visibilitychange` — never applies, because that style
// change waits on a rendering update that will not happen until the tab is visible again.
//
// The third version does not consult visibility at all. It accumulates its own elapsed time and
// clamps every step, so no code path can advance it by more than one frame's worth at once. That
// clamp IS the fix; this test exists so it cannot be quietly removed or turned back into a
// declarative animation.
test("the wallpaper drift cannot jump when a hidden tab comes back", async () => {
  const read = async (name) => (await import("node:fs/promises"))
    .readFile(new URL(`../src/${name}`, import.meta.url), "utf8");

  const hook = await read("hooks/useWallpaperDrift.js");
  assert.match(hook, /elapsed \+= Math\.min\(now - last, MAX_STEP_MS\)/,
    "the per-frame clamp is gone, so one frame back from a hidden tab replays the whole gap");
  assert.match(hook, /requestAnimationFrame/, "the drift must be driven per frame, not by a timeline");
  assert.match(hook, /prefers-reduced-motion/, "the drift ignores the reduced-motion setting");
  // `transform` belongs to wallpaperFilterStyle's blur overscan; the standalone properties
  // compose with it instead of overwriting it.
  assert.match(hook, /node\.style\.scale/, "the drift stopped using the standalone scale property");
  assert.match(hook, /node\.style\.translate/, "the drift stopped using the standalone translate property");

  const css = await read("styles.css");
  assert.doesNotMatch(css, /animation:\s*wallpaper-drift/, "the pan moved back into a CSS animation");
  // A declaration, not the word: the comment above .wallpaper names the property to explain why
  // it is not used.
  assert.doesNotMatch(css, /animation-play-state\s*:/, "the visibility guard that never worked came back");
});

// The direction is a property of the picture, not of the visit. Choosing it at random per load
// would put two tabs showing the same wallpaper on different paths — the same "it looks like it
// jumped" complaint the clamped clock exists to prevent, re-invented one level up.
test("each wallpaper always drifts the same way, and different wallpapers differ", async () => {
  const { driftAngleFor } = await import("../src/hooks/useWallpaperDrift.js");

  assert.equal(driftAngleFor("20260826"), driftAngleFor("20260826"), "the same wallpaper drifted two ways");
  assert.notEqual(driftAngleFor("20260826"), driftAngleFor("20260825"), "consecutive days share a direction");

  // Traditional Ken Burns pans are predominantly lateral: a steep vertical drift on a landscape
  // reads as the frame sliding off rather than as a camera move, and Bing ships landscapes.
  const angles = new Set();
  for (let day = 0; day < 60; day++) {
    const angle = driftAngleFor(`2026${String(day).padStart(4, "0")}`);
    angles.add(angle);
    const offHorizontal = Math.min(Math.abs(angle), Math.abs(180 - Math.abs(angle)));
    assert.ok(offHorizontal <= 40, `${angle}° drifts too steeply for a landscape`);
  }
  assert.ok(angles.size >= 6, `only ${angles.size} directions in use — the move will read as fixed`);
});

// Three versions of a progressive backdrop blur shipped in these bands and all three came back
// as bug reports, the last one from a screenshot of the bottom band on its own. The cause is not
// tuning. A masked backdrop-filter layer composites `a x blurred + (1-a) x sharp`, so it
// crossfades between two versions of the frame rather than blurring it partially, and on
// repeating structure that crossfade is a visible double exposure whose strength goes with the
// ratio between the two radii. The last attempt held that ratio to 1.45 across eight rungs, about
// as tight as it can be pushed while still reaching a useful total, and was still wrong on a
// patterned photograph. A variable blur needs the radius itself to vary and CSS cannot express
// that. This test exists so there is no fourth attempt.
test("the edge bands are tint only, with no backdrop blur to ghost the photograph", async () => {
  const read = async (name) => (await import("node:fs/promises"))
    .readFile(new URL(`../src/${name}`, import.meta.url), "utf8");
  const css = await read("styles.css");
  const bands = css.slice(css.indexOf(".edge {"), css.indexOf(".newtab--light .edge"));

  assert.doesNotMatch(bands, /backdrop-filter/, "a progressive blur came back to the edge bands");
  assert.doesNotMatch(css, /--edge-blur/, "the blur ladder came back");
  assert.doesNotMatch(css, /\.edge i\b/, "the edge bands grew layers again");
  assert.doesNotMatch(await read("App.jsx"), /<i \/>/, "the edge bands grew layers again");

  // With the blur gone the tint is the entire treatment, so it is the only thing keeping the
  // photo credit and the settings button legible over an arbitrary photograph. It has to reach.
  assert.match(bands, /\.edge--bottom \{[^}]*rgba\(0, 0, 0, \.4\d\)/,
    "the bottom tint no longer gets dark enough to carry the captions on its own");
});

// A drop shadow buys contrast against the bright parts of a photograph and nothing at all against
// the dark parts. The other half of the job is a lit top edge and a shaded bottom one, which is
// what makes a surface read as an object resting on a picture rather than a shape pasted onto it,
// and the tiles had no such thing — the report was "\u56fe\u6807\u4e0d\u80fd\u51f8\u663e\u9ad8\u7ea7\u611f".
test("every tile wears one bevel, and it is derived from nothing", async () => {
  const css = await (await import("node:fs/promises"))
    .readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(css, /--tile-bevel:/, "the tile bevel is gone");
  assert.match(css, /\.shortcut__icon::after\s*\{[^}]*box-shadow:\s*var\(--tile-bevel\)/,
    "the bevel is no longer painted over every tile");

  // Constant is the load-bearing word. Three earlier attempts at improving this surface all
  // failed the same way — a brand tint from the mark's hue, a sheen pass, a light/dark rule —
  // because each varied per icon and turned a grid of unvetted artwork into a patchwork. Nothing
  // in the bevel may reference the tile's own colour, which is what makes that impossible here.
  const bevel = css.slice(css.indexOf("--tile-bevel:"));
  assert.doesNotMatch(bevel.slice(0, bevel.indexOf(";")), /--tile-accent|currentColor|var\(--t/,
    "the bevel started varying with the icon it sits on");

  // Applied once, not twice: the folder and Add tiles carried --glass-rim as well, which put two
  // highlights on one edge as soon as the bevel went on.
  const glass = css.slice(css.indexOf(".shortcut__icon--folder,"));
  assert.doesNotMatch(glass.slice(0, glass.indexOf("}")), /--glass-rim/,
    "the glass tiles are wearing two rims");
});

test("the grain and the vignette go over the edge bands, not under them", async () => {
  const read = async (name) => (await import("node:fs/promises"))
    .readFile(new URL(`../src/${name}`, import.meta.url), "utf8");
  const css = await read("styles.css");

  const layer = (selector) => {
    const start = css.indexOf(`\n${selector} {`);
    assert.ok(start >= 0, `${selector} rule is gone`);
    const found = /z-index:\s*(-?\d+)/.exec(css.slice(start, css.indexOf("}", start)));
    assert.ok(found, `${selector} has no z-index`);
    return Number(found[1]);
  };
  // The grain is one uniform one-pixel dither over the whole page and the vignette is a single
  // photographic falloff; both have to be laid over the finished frame. Underneath the bands
  // they were being tinted along with the photograph, which is not what either is for.
  assert.ok(layer(".grain") > layer(".edge"), "the edge tint is sitting on top of the film grain");
  assert.ok(layer(".vignette") > layer(".edge"), "the edge tint is sitting on top of the vignette");
  assert.ok(layer(".edge") > layer(".wallpaper"), "the edge tint is under the wallpaper");

  // The markup order has to agree with the z-indexes, or the next person to read either is
  // misled about which layer sees which.
  const app = await read("App.jsx");
  const order = [...app.matchAll(/className="(edge edge--top|edge edge--bottom|vignette|grain)"/g)]
    .map(([, name]) => name);
  assert.deepEqual(order, ["edge edge--top", "edge edge--bottom", "vignette", "grain"]);
  // Eight <i> in the bottom band, none in the top.
  assert.match(app, /<div className="edge edge--top" aria-hidden="true" \/>/);
  assert.match(app, /<div className="edge edge--bottom" aria-hidden="true" \/>/);
});

test("motion runs off one set of tokens, and reduced motion actually stops it", async () => {
  const css = await (await import("node:fs/promises"))
    .readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  for (const token of ["--ease-out", "--ease-in-out", "--ease-spring", "--dur-1", "--dur-2", "--dur-3", "--dur-4"]) {
    assert.ok(css.includes(`${token}:`), `${token} is gone`);
  }
  // The real spring is an upgrade, not a requirement: a cubic-bezier can only overshoot once, so
  // linear() is the only way to get the second, smaller return that makes a settle read as
  // physical. It has to stay behind @supports — the floor is Chrome 109 and linear() is 113.
  assert.match(css, /@supports \(animation-timing-function: linear\(0, 1\)\)/,
    "the spring easing lost its feature query, so Chrome 109-112 gets an invalid easing");

  // Every tile arrives on its own delay; the grid no longer fades as one block. Section headings
  // join the same queue rather than running one of their own, so the sweep stays a single sweep
  // across a divided grid instead of restarting under every heading.
  const entrance = css.slice(css.indexOf(".shortcut-grid--ready .shortcut"));
  const entranceRule = entrance.slice(0, entrance.indexOf("}"));
  assert.match(entranceRule, /animation:\s*tile-in/);
  assert.ok(entranceRule.includes(".shortcut-grid--ready .section-heading"),
    "the heading is not in the entrance queue with the tiles");
  assert.match(css, /animation-delay:\s*calc\(min\(var\(--i, 0\), \d+\)/);

  // Shortening an infinite animation's duration does not stop it — it runs the whole cycle every
  // hundredth of a millisecond, which is worse than leaving it alone. This is the line that
  // stops the drag jiggle for someone who asked for less motion.
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /animation-iteration-count:\s*1\s*!important/,
    "reduced motion never stops the infinite animations");
  assert.match(reduced, /animation-delay:\s*0ms\s*!important/, "the entrance stagger survives reduced motion");
});

// Stacked drop-shadows compound, and forgetting that is how this went wrong twice. `filter:
// drop-shadow(A) drop-shadow(B)` does not draw two shadows of the element — B draws a shadow of
// (element + A), A's shadow included — so the ink hugging the edge is 1-(1-a)(1-b)(1-c) and not
// the largest term. At .34/.26/.30 that is 66% black, and tightening the far layer without
// touching the alphas kept all of it and packed it into a narrow band, which stops reading as a
// shadow and starts reading as a dark rim drawn around the tile.
test("the tile shadow does not compound into a dark rim, least of all on white", async () => {
  const css = await (await import("node:fs/promises"))
    .readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  const compounded = (declaration) => 1 - [...declaration.matchAll(/rgba\(0, 0, 0, (\.\d+)\)/g)]
    .reduce((total, [, alpha]) => total * (1 - Number(alpha)), 1);
  const declaration = (marker) => {
    const start = css.indexOf(marker);
    assert.ok(start >= 0, `${marker} is gone`);
    return css.slice(start, css.indexOf(";", start));
  };

  const base = compounded(declaration("--tile-shadow:"));
  assert.ok(base < 0.58, `the wallpaper shadow compounds to ${(base * 100).toFixed(0)}% at the contact edge`);
  // Still has to hold a tile up against a photograph, where 5% black was measurably invisible.
  assert.ok(base > 0.4, `the wallpaper shadow compounds to only ${(base * 100).toFixed(0)}%`);

  // The folder panel and the dialog preview are near-white, and the same ink there is a smudge.
  const light = compounded(declaration(".tile-preview,"));
  assert.ok(light < base / 2, `the light-surface shadow is ${(light * 100).toFixed(0)}%, barely lighter`);

  // The bevel is what defines the edge; it must stay faint enough not to join the shadow into
  // one dark band, which is the same defect arriving from the inside.
  const bevel = declaration("--tile-bevel:");
  for (const [, alpha] of bevel.matchAll(/rgba\(0, 0, 0, (\.\d+)\)/g)) {
    assert.ok(Number(alpha) <= 0.12, `a bevel layer at ${alpha} black will read as a drawn border`);
  }
});
