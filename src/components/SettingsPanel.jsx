import { useEffect, useRef, useState } from "react";
import { ArrowClockwise, Check, DownloadSimple, Globe, UploadSimple, X } from "@phosphor-icons/react";
import { Silk } from "./Silk";
import { wallpaperThumbnail } from "../lib/background";
import { GRADIENTS } from "../lib/background-cache-keys";
import { cleanForExport, validateShortcutPayload } from "../lib/shortcuts-file";
import { iconStatus, iconSummary } from "../lib/icon-status";

function formatDate(startDate) {
  if (!/^\d{8}$/.test(startDate ?? "")) return "";
  return `${startDate.slice(4, 6)}/${startDate.slice(6, 8)}`;
}

// Cache URLs are not directly displayable, so each tile resolves its own blob and releases it on
// unmount — leaking one object URL per thumbnail per open would add up over a long session.
function WallpaperThumb({ image, active, onClick }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let disposed = false;
    let created = null;
    void wallpaperThumbnail(image.cacheUrl).then((url) => {
      if (disposed) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      created = url;
      setSrc(url);
    });
    return () => {
      disposed = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [image.cacheUrl]);

  return (
    <button
      className={`wallpaper-card ${active ? "wallpaper-card--active" : ""}`}
      type="button"
      onClick={onClick}
      title={image.copyright || image.title}
      aria-pressed={active}
    >
      {src
        ? <img src={src} alt="" draggable="false" />
        : <span className="wallpaper-card__pending" aria-hidden="true" />}
      <span className="wallpaper-card__date">{formatDate(image.startDate)}</span>
      {active && <span className="wallpaper-card__check" aria-hidden="true"><Check size={14} weight="bold" /></span>}
    </button>
  );
}

// Renders the wallpaper itself, shrunk — same component, same colours, same drift. An
// approximation here would be a picker that shows you something other than what you are picking.
function GradientSwatch({ gradient, active, onClick }) {
  return (
    <button
      className={`gradient-card ${active ? "gradient-card--active" : ""}`}
      type="button"
      onClick={onClick}
      aria-label="使用纯色背景"
      aria-pressed={active}
    >
      <Silk colors={gradient.colors} still />
      {active && <span className="gradient-card__check" aria-hidden="true"><Check size={11} weight="bold" /></span>}
    </button>
  );
}

export function SettingsPanel({ open, onClose, wallpaperApi, shortcuts, siteAccess, showClock, onToggleClock, onReplace, onMerge, notify }) {
  const [library, setLibrary] = useState(null);
  const [importError, setImportError] = useState("");
  const [pendingImport, setPendingImport] = useState(null);
  const fileRef = useRef(null);
  // Read from the grid on screen, not from the worker's last run: after a reload nothing runs at
  // all, because everything is already cached, and a status that only appears mid-batch is
  // exactly the status nobody sees when something is wrong.
  const icons = iconStatus(shortcuts);
  // Held in a ref so the open-effect depends only on `open`. Depending on the api object made
  // the effect re-run on every render, refetching the library in a loop and wiping the pending
  // import each time.
  const apiRef = useRef(wallpaperApi);
  apiRef.current = wallpaperApi;

  useEffect(() => {
    if (!open) return undefined;
    let disposed = false;
    setImportError("");
    setPendingImport(null);
    void apiRef.current.loadWallpaperLibrary().then((next) => {
      if (!disposed) setLibrary(next);
    });
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      disposed = true;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  // A gradient replaces the photo entirely, so neither "auto" nor any photo reads as selected
  // while one is active.
  const usingGradient = Boolean(library?.gradientKey);
  const auto = !usingGradient && library?.mode !== "pinned";

  // A dropped reply must not blank the panel: keep whatever the library already held rather
  // than clearing the thumbnails and every selection state along with it.
  function adopt(next) {
    if (next) setLibrary(next);
  }

  async function pin(key) {
    adopt(await wallpaperApi.pinWallpaper(key));
  }

  async function follow() {
    adopt(await wallpaperApi.followLatest());
  }

  async function pickGradient(key) {
    adopt(await wallpaperApi.pickGradient(key));
  }

  function exportData() {
    const payload = {
      app: "LumaTab",
      version: 1,
      exportedAt: new Date().toISOString(),
      shortcuts: cleanForExport(shortcuts),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lumatab-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify("已导出数据");
  }

  async function pickFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportError("");
    try {
      const items = validateShortcutPayload(JSON.parse(await file.text()));
      // Never apply straight away: replacing is destructive and the user has not yet said
      // whether they meant replace or merge.
      setPendingImport(items);
    } catch (error) {
      setPendingImport(null);
      setImportError(error.message || "无法读取该文件");
    }
  }

  function applyImport(mode) {
    if (!pendingImport) return;
    if (mode === "replace") onReplace(pendingImport);
    else onMerge(pendingImport);
    setPendingImport(null);
    onClose();
  }

  return (
    <div className="drawer-scrim" role="presentation" onMouseDown={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="drawer__header">
          <h2 id="settings-title">设置</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>

        <div className="drawer__body">
          <section className="group">
            <div className="group__head">
              <h3 className="group__title">壁纸</h3>
              <button className={`chip ${auto ? "chip--on" : ""}`} type="button" onClick={follow} aria-pressed={auto}>
                <ArrowClockwise size={13} weight="bold" />每日自动更新
              </button>
            </div>
            <p className="group__hint">
              {usingGradient
                ? "正在使用纯色背景。"
                : auto ? "跟随 Bing 每日图片自动更换。" : "已固定为选中的图片，不再自动更换。"}
            </p>

            <h4 className="group__label">近 7 日图片</h4>
            {library?.images?.length
              ? <div className="wallpaper-grid">
                {library.images.map((image) => (
                  <WallpaperThumb
                    key={image.key}
                    image={image}
                    active={!auto && !usingGradient && image.key === library.activeKey}
                    onClick={() => pin(image.key)}
                  />
                ))}
              </div>
              : <p className="group__hint">正在获取可用壁纸…</p>}

            <h4 className="group__label">纯色背景</h4>
            <div className="gradient-grid">
              {GRADIENTS.map((gradient) => (
                <GradientSwatch
                  key={gradient.key}
                  gradient={gradient}
                  active={library?.gradientKey === gradient.key}
                  onClick={() => pickGradient(gradient.key)}
                />
              ))}
            </div>
          </section>

          <section className="group">
            <div className="group__head"><h3 className="group__title">显示效果</h3></div>
            {/* Two sliders used to live here, 亮度 and 模糊, and both are gone. Blur existed to
                push the photograph a step behind the tiles; `.frost` now does that for the whole
                page and does the half that matters — a blur softens the picture and leaves its
                luminance alone, while frosting lifts and flattens it, and lifting is what buys
                the icons their contrast. Brightness is measured from each photo instead of being
                asked for: the tone matcher was always better at it than a slider the user has to
                find and then get right, and it only ever deferred to the slider because a
                measurement must not override a decision. With no decision to override it simply
                runs. */}
            <p className="group__hint">背景的明暗由每张图自动匹配，无需手动调整。</p>
            <label className="check">
              <input type="checkbox" checked={showClock} onChange={onToggleClock} />
              <span><b>显示时钟</b><small>页面顶部的时间与日期</small></span>
            </label>
          </section>

          <section className="group">
            <div className="group__head"><h3 className="group__title">数据</h3></div>
            <p className="group__hint">导出当前全部快捷方式，或从此前导出的文件恢复。</p>
            <div className="group__actions">
              <button className="ghost-button" type="button" onClick={exportData}>
                <DownloadSimple size={16} weight="bold" />导出为 JSON
              </button>
              <button className="ghost-button" type="button" onClick={() => fileRef.current?.click()}>
                <UploadSimple size={16} weight="bold" />选择文件导入
              </button>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={pickFile} />
            </div>
            {importError && <p className="form-error" role="alert">{importError}</p>}
            {pendingImport && (
              <div className="import-confirm">
                <p>已读取 <b>{pendingImport.length}</b> 个条目，选择导入方式：</p>
                <div className="group__actions">
                  <button className="ghost-button" type="button" onClick={() => applyImport("merge")}>
                    合并（保留现有）
                  </button>
                  <button className="danger-button danger-button--inline" type="button" onClick={() => applyImport("replace")}>
                    替换全部
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Last, and deliberately quiet: the page-top prompt is where this decision is actually
              offered. What lives here is the switch to change your mind, so it reads as a footnote
              rather than as another thing to configure. */}
          <section className="group group--minor">
            <div className="group__head"><h3 className="group__title">网站图标</h3></div>
            <p className="group__hint">
              {siteAccess.granted
                ? "已允许读取网站以抓取高清图标。收回后已抓到的图标仍会保留。"
                : "当前使用 Chrome 已有的低清图标。允许读取网站可抓取高清版本，仅用于取图标。"}
            </p>
            {/* The count is the point of this whole section. When the icon cache and its failure
                list drifted apart, every tile fell back to a letter with nothing said anywhere —
                no error, no log the user would ever open — and the only recovery was to uninstall
                the extension. A number and a button turn that into something visible and fixable. */}
            {icons.total > 0 && <p className="icon-status">{iconSummary(icons)}</p>}
            <div className="group__actions">
              {siteAccess.granted ? (
                <button className="ghost-button ghost-button--small" type="button" onClick={siteAccess.revoke}>
                  <X size={14} weight="bold" />收回权限
                </button>
              ) : (
                <button className="ghost-button ghost-button--small" type="button" onClick={siteAccess.grant}>
                  <Globe size={14} weight="bold" />允许读取网站
                </button>
              )}
              {icons.total > 0 && (
                <button
                  className="ghost-button ghost-button--small"
                  type="button"
                  onClick={siteAccess.refetch}
                  disabled={siteAccess.refetching}
                >
                  <ArrowClockwise size={14} weight="bold" />
                  {siteAccess.refetching ? "正在重新抓取…" : "重新抓取图标"}
                </button>
              )}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
