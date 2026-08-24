// Produces every image the Chrome Web Store listing needs, from the real built extension.
//
//   node scripts/capture-store-assets.mjs            → dist/store-assets/
//
// Why it drives a browser instead of mocking anything: the store requires screenshots of the
// actual product, and the only honest way to get a 1280x800 frame of a new tab page is to render
// the real new tab page. Chrome refuses --load-extension these days, so the extension goes in
// through CDP's Extensions domain, which is the supported replacement and works headless.
//
// Two deliberate deviations from the shipping build, both documented on screen-state grounds:
//   * The optional site permission is pre-granted in a throwaway copy of the build. Headless
//     Chrome auto-denies the runtime prompt, and the granted state is a real one — it is exactly
//     what a user sees after clicking 允许. The copy is deleted at the end and never packaged.
//   * The grid is seeded with well-known public sites. The extension ships with no default
//     shortcuts at all, so an unseeded capture would be an empty page.
//
// Icons resolve over the network. On a machine without egress the tiles fall back to letter
// icons — still a truthful screenshot, just a less flattering one — so run this where the
// browser can reach the sites listed in DEMO_SITES.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const BUILD = resolve(ROOT, "dist/client");
const SHOT_BUILD = resolve(ROOT, ".shot-build");
const PROFILE = resolve(ROOT, ".shot-profile");
const OUT = resolve(ROOT, "dist/store-assets");
const PORT = 9412;

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
];

const DEMO_SITES = [
  ["GitHub", "https://github.com/"],
  ["Wikipedia", "https://www.wikipedia.org/"],
  ["YouTube", "https://www.youtube.com/"],
  ["Figma", "https://www.figma.com/"],
  ["Notion", "https://www.notion.so/"],
  ["Stack Overflow", "https://stackoverflow.com/"],
  ["MDN", "https://developer.mozilla.org/"],
  ["Bilibili", "https://www.bilibili.com/"],
  ["知乎", "https://www.zhihu.com/"],
  ["豆瓣", "https://www.douban.com/"],
  ["Spotify", "https://open.spotify.com/"],
  ["Netflix", "https://www.netflix.com/"],
  ["Medium", "https://medium.com/"],
  ["Reddit", "https://www.reddit.com/"],
  ["Gmail", "https://mail.google.com/"],
  ["Trello", "https://trello.com/"],
];
const DEMO_FOLDER = {
  id: "folder-design", type: "folder", name: "设计",
  children: [
    { id: "f1", type: "link", name: "Figma", url: "https://www.figma.com/", iconMode: "auto" },
    { id: "f2", type: "link", name: "Dribbble", url: "https://dribbble.com/", iconMode: "auto" },
    { id: "f3", type: "link", name: "Behance", url: "https://www.behance.net/", iconMode: "auto" },
    { id: "f4", type: "link", name: "Unsplash", url: "https://unsplash.com/", iconMode: "auto" },
  ],
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) throw new Error("找不到 Chrome，请在 CHROME_CANDIDATES 中补上你的安装路径");
  return found;
}

// Windows stores the PAC URL in the registry; passing it explicitly matters because a fresh
// headless profile does not inherit the interactive session's proxy settings, and on a network
// that routes through a PAC every icon fetch silently fails without it.
async function systemProxyArgs() {
  if (process.platform !== "win32") return [];
  const pac = await new Promise((done) => {
    const p = spawn("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "AutoConfigURL"], { windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.on("close", () => done(/AutoConfigURL\s+REG_SZ\s+(\S+)/.exec(out)?.[1] ?? null));
    p.on("error", () => done(null));
  });
  return pac ? [`--proxy-pac-url=${pac}`] : [];
}

function connect(url) {
  return new Promise(async (done) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    await new Promise((r) => { ws.onopen = r; });
    done({
      send: (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }),
      close: () => ws.close(),
    });
  });
}

async function main() {
  if (!existsSync(BUILD)) throw new Error("dist/client 不存在，请先运行 npm run build:extension");

  await rm(SHOT_BUILD, { recursive: true, force: true });
  await rm(PROFILE, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  await cp(BUILD, SHOT_BUILD, { recursive: true });

  const manifestPath = resolve(SHOT_BUILD, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.host_permissions = [...manifest.host_permissions, ...(manifest.optional_host_permissions ?? [])];
  delete manifest.optional_host_permissions;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const chrome = spawn(findChrome(), [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--no-first-run", "--no-default-browser-check",
    "--window-size=1280,860", "--hide-scrollbars", "--force-device-scale-factor=1",
    ...(await systemProxyArgs()),
    "about:blank",
  ], { stdio: "ignore", detached: false });

  let browser;
  for (let i = 0; i < 40; i++) {
    try {
      const info = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      browser = await connect(info.webSocketDebuggerUrl);
      break;
    } catch { await wait(500); }
  }
  if (!browser) throw new Error("Chrome 没有启动");

  try {
    const loaded = await browser.send("Extensions.loadUnpacked", { path: SHOT_BUILD });
    const extId = loaded.result?.id;
    if (!extId) throw new Error("扩展加载失败: " + JSON.stringify(loaded.error));
    console.log("扩展 ID:", extId);

    const created = await browser.send("Target.createTarget", { url: `chrome-extension://${extId}/index.html` });
    await wait(1500);
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const page = await connect(list.find((t) => t.id === created.result.targetId).webSocketDebuggerUrl);

    await page.send("Runtime.enable");
    await page.send("Page.enable");
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

    const js = async (expression) => {
      const r = await page.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      return r.result?.exceptionDetails ? null : r.result?.result?.value;
    };
    const centreOf = async (selector) => {
      const raw = await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2})})()`);
      return raw ? JSON.parse(raw) : null;
    };
    const click = async (point) => {
      if (!point) return false;
      await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1, buttons: 1 });
      await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1, buttons: 0 });
      return true;
    };
    const shot = async (name) => {
      const d = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(resolve(OUT, `${name}.png`), Buffer.from(d.result.data, "base64"));
      console.log("  ", name + ".png");
    };

    const items = DEMO_SITES.slice(0, 6).map(([name, url], i) => ({ id: `a${i}`, type: "link", name, url, iconMode: "auto" }));
    items.push(DEMO_FOLDER);
    DEMO_SITES.slice(6).forEach(([name, url], i) => items.push({ id: `b${i}`, type: "link", name, url, iconMode: "auto" }));
    await js(`chrome.storage.local.set({"lumatab.shortcuts.v5": ${JSON.stringify(items)}})`);
    await page.send("Page.reload");

    for (let i = 0; i < 40; i++) {
      if (await js(`document.querySelectorAll(".shortcut[data-tile-id]").length`)) break;
      await wait(500);
    }
    // Icons arrive over the network in a background batch; settle for whatever lands.
    let resolved = 0;
    for (let i = 0; i < 25; i++) {
      resolved = await js(`document.querySelectorAll(".shortcut img.brand-icon").length`) ?? 0;
      if (resolved >= items.length - 2) break;
      await wait(2000);
    }
    console.log(`磁贴 ${await js(`document.querySelectorAll(".shortcut[data-tile-id]").length`)} 个，其中 ${resolved} 个取到真实图标`);
    if (resolved === 0) console.log("⚠ 一个真实图标都没取到——这台机器大概没有外网，截图里会是字母图标");
    await wait(1500);

    console.log("截图:");
    await shot("01-home");

    if (await click(await centreOf('[data-tile-id="folder-design"]'))) {
      await wait(900);
      await shot("02-folder");
      await js(`document.querySelector(".folder-backdrop")?.dispatchEvent(new MouseEvent("mousedown",{bubbles:true}))`);
      await wait(700);
    }

    if (await click(await centreOf(".settings-launcher"))) {
      await wait(1400);
      // Scroll past the wallpaper library: without network it shows a loading line, and the
      // sections below (display tuning, export/import, optional permission) are the ones worth
      // showing anyway.
      await js(`(()=>{const g=document.querySelector(".group");if(g)g.parentElement.scrollTop=g.parentElement.scrollHeight})()`);
      await wait(700);
      await shot("03-settings");
      await click(await centreOf(".gradient-grid button:nth-child(7)"));
      await wait(1200);
      await click(await centreOf("aside button[aria-label='关闭']"));
      await wait(1200);
      await shot("04-gradient");
    }

    // Promotional tiles. Both must be 24-bit PNG with no alpha channel — the store rejects RGBA
    // here — which is what captureScreenshot produces when the page paints an opaque background.
    //
    // They are built from the two real files: the home capture taken moments ago, and the icon
    // out of the build. The version this replaced drew its own mark in CSS — an orange rounded
    // square with a white bar — which bore no resemblance to the actual blue-violet icon. A store
    // listing whose promo art and icon are different colours is the definition of off-brand.
    const homeShot = (await readFile(resolve(OUT, "01-home.png"))).toString("base64");
    const markIcon = (await readFile(resolve(BUILD, "assets/icons/icon-128.png"))).toString("base64");
    for (const [name, width, height, html] of [
      ["promo-440x280", 440, 280, promoTileHtml(440, 280, homeShot, markIcon)],
      ["promo-1400x560", 1400, 560, promoTileHtml(1400, 560, homeShot, markIcon)],
    ]) {
      await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await page.send("Page.navigate", { url: "data:text/html;charset=utf-8," + encodeURIComponent(html) });
      await wait(1000);
      await shot(name);
    }

    // The store icon is a separate asset from the toolbar icon, and this is why: the image
    // guidelines want the artwork at 96x96 inside a 128x128 canvas, with the remaining 16px on
    // each side transparent. The manifest icon is edge-to-edge on purpose — correct in a browser
    // toolbar, oversized next to every other listing in the store grid.
    const iconData = (await readFile(resolve(BUILD, "assets/icons/icon-128.png"))).toString("base64");
    const iconPage = `<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;width:128px;height:128px;background:transparent}
      img{position:absolute;left:16px;top:16px;width:96px;height:96px}
      </style><img src="data:image/png;base64,${iconData}">`;
    await page.send("Emulation.setDeviceMetricsOverride", { width: 128, height: 128, deviceScaleFactor: 1, mobile: false });
    await page.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    await page.send("Page.navigate", { url: "data:text/html;charset=utf-8," + encodeURIComponent(iconPage) });
    await wait(900);
    await shot("store-icon-128");
    await page.send("Emulation.setDefaultBackgroundColorOverride");

    page.close();
  } finally {
    browser.close();
    await wait(600);
    chrome.kill();
    await wait(800);
    await rm(SHOT_BUILD, { recursive: true, force: true });
    await rm(PROFILE, { recursive: true, force: true });
  }
  console.log("\n全部产物在:", OUT);
}

// One layout at two sizes: everything scales off the canvas height so the 1400x560 marquee is the
// same design as the 440x280 tile rather than a second thing to keep in sync.
//
// Words on a dark ground at the left, the product itself as a window tilted in from the right.
// The text sits on its own stacking layer because the window's drop shadow otherwise spills
// across it and greys it out.
function promoTileHtml(width, height, homeShot, markIcon) {
  const s = height / 280;
  return `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}
  /* Single quotes on purpose: this string is interpolated into an HTML document whose attributes
     use double quotes, and a family name in double quotes closes them early. That bug silently
     dropped the background gradient and every font choice on the whole tile. */
  body{position:relative;font-family:'PingFang SC','Microsoft YaHei',system-ui,sans-serif;
    background:linear-gradient(135deg,#10152b 0%,#1b2140 48%,#262a52 100%)}
  /* Width and offset are tuned against the tagline, which is the widest line and sets how far
     right the window has to sit. At 440 the two were overlapping by about 20px. */
  .shot{position:absolute;right:${-58 * s}px;top:50%;transform:translateY(-50%) rotate(-4deg);
    width:50%;border-radius:${9 * s}px;box-shadow:0 ${14 * s}px ${36 * s}px rgba(0,0,0,.5)}
  .wrap{position:absolute;z-index:2;left:${30 * s}px;top:50%;transform:translateY(-50%);color:#fff;
    text-shadow:0 ${1 * s}px ${6 * s}px rgba(0,0,0,.6)}
  .mark{display:block;width:${48 * s}px;height:${48 * s}px;border-radius:${11 * s}px;margin-bottom:${14 * s}px}
  h1{margin:0;font-size:${21 * s}px;font-weight:600;line-height:1.2;white-space:nowrap}
  p{margin:${9 * s}px 0 0;font-size:${11 * s}px;color:rgba(255,255,255,.76);white-space:nowrap}
  </style>
  <img class="shot" src="data:image/png;base64,${homeShot}">
  <div class="wrap">
    <img class="mark" src="data:image/png;base64,${markIcon}">
    <h1>LumaTab · 浮光新页</h1>
    <p>干净的新标签页 · 无广告 · 无账号 · 不收集数据</p>
  </div>`;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
