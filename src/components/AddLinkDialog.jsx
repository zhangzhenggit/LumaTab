import { useEffect, useState } from "react";
import { ArrowClockwise, CircleNotch, X } from "@phosphor-icons/react";
import { BrandIcon, iconAppearance } from "./BrandIcon";
import { iconProps } from "./ShortcutTile";
import { ACCENTS, MAX_MONOGRAM_GLYPHS, monogramFor, normalizeUrl, trimMonogram } from "../lib/icons";
import { resolveIconPreview } from "../lib/site-icon-cache";

// The empty-state preview stands in for a real tile, so it carries the product's own identity
// rather than the word "示例" — a placeholder that named itself made the preview read as a
// sample of something else instead of as this extension's own tile.
const PLACEHOLDER = { name: "浮光新页", url: "https://lumatab.local/" };

export function AddLinkDialog({ open, item = null, onClose, onSubmit }) {
  const [error, setError] = useState("");
  // Mirrors the form so the preview tile updates as the user types. Seeded from the item being
  // edited so opening the editor shows the tile as it looks on the grid right now.
  const [draft, setDraft] = useState({ name: "", url: "", iconMode: "auto", accentColor: null, monogram: "" });
  // Holds an icon fetched by the button below, so the preview shows the real artwork before the
  // link is ever saved — and because resolution writes to the shared cache, the tile that lands
  // on the grid needs no request of its own.
  const [fetched, setFetched] = useState(null);
  const [fetching, setFetching] = useState(false);
  const [fetchNote, setFetchNote] = useState("");
  const [editingMonogram, setEditingMonogram] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setFetched(null);
    setFetching(false);
    setFetchNote("");
    setDraft({
      name: item?.name ?? "",
      url: item?.url ?? "",
      iconMode: item?.iconMode === "generated" ? "generated" : "auto",
      accentColor: item?.accentColor ?? null,
      monogram: item?.monogram ?? "",
    });
  }, [open, item]);

  // A different URL invalidates whatever was fetched for the previous one.
  useEffect(() => {
    setFetched(null);
    setFetchNote("");
  }, [draft.url]);

  if (!open) return null;

  const isFolder = item?.type === "folder";
  const empty = !draft.name && !draft.url && !item;
  // Carries the resolved icon of the item being edited, so the preview shows real artwork rather
  // than dropping to a letter the moment the dialog opens.
  const previewItem = {
    ...(item ?? {}),
    type: isFolder ? "folder" : "link",
    name: draft.name || item?.name || PLACEHOLDER.name,
    url: draft.url || item?.url || PLACEHOLDER.url,
    iconMode: draft.iconMode,
    accentColor: draft.accentColor,
    monogram: draft.monogram,
    children: item?.children ?? [],
    ...(fetched ? {
      _iconUrl: fetched.url,
      _iconSource: fetched.source,
      _iconNativeSize: fetched.nativeSize,
      _iconFullBleed: fetched.fullBleed,
    } : null),
  };

  // Whether the tile in the preview is currently a letter — either because "字母图标" is
  // selected, or because auto mode has no artwork to show. Both cases put glyphs and a colour on
  // screen, so both must expose the controls that change them.
  const showsLetter = !isFolder && iconAppearance(previewItem).kind === "letter";
  // What the tile is currently showing: the override when set, otherwise the derived glyphs.
  const shownMonogram = monogramFor(previewItem.name, draft.monogram);

  async function fetchIcon() {
    let target;
    try {
      target = normalizeUrl(draft.url);
    } catch {
      setFetchNote("请先填写有效网址");
      return;
    }
    setFetching(true);
    setFetchNote("");
    try {
      const icon = await resolveIconPreview(target);
      setFetched(icon);
      setFetchNote(icon ? "已获取网站图标" : "未找到可用图标，将使用字母图标");
      // Getting artwork only helps if the tile is allowed to show it.
      if (icon) setDraft((current) => ({ ...current, iconMode: "auto" }));
    } finally {
      setFetching(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const values = { name: String(form.get("name") ?? "").trim() };
      if (item?.type !== "folder") {
        values.url = String(form.get("url") ?? "").trim();
        values.iconMode = String(form.get("iconMode") ?? "auto");
        values.accentColor = draft.accentColor;
        values.monogram = trimMonogram(draft.monogram) || null;
      }
      onSubmit(values);
      event.currentTarget.reset();
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="add-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="dialog__header">
          <div><p className="dialog__eyebrow">{item ? "编辑" : "新快捷链接"}</p><h2 id="add-title">{item?.type === "folder" ? "重命名分组" : item ? "修改快捷链接" : "添加到浮光新页"}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={20} /></button>
        </header>
        <form className="dialog__form" onSubmit={submit} key={item?.id ?? "new-link"}>
          <div className={`tile-preview ${empty ? "tile-preview--placeholder" : ""}`}>
            <div {...iconProps(previewItem)}>
              {previewItem.type === "folder"
                ? <span className="folder-preview" aria-hidden="true" />
                : showsLetter
                  ? <input
                    className="letter-icon letter-icon--editable"
                    data-length={[...shownMonogram].length}
                    name="monogram"
                    aria-label="图标文字"
                    maxLength={MAX_MONOGRAM_GLYPHS * 2}
                    value={editingMonogram ? draft.monogram : shownMonogram}
                    onFocus={() => {
                      // Seed from what is on screen so editing continues from the visible glyphs
                      // rather than blanking the tile the moment it is clicked.
                      setEditingMonogram(true);
                      setDraft((current) => ({ ...current, monogram: current.monogram || shownMonogram }));
                    }}
                    onBlur={() => {
                      setEditingMonogram(false);
                      // Clicking in and out without changing anything must not pin an override,
                      // or a later rename would stop updating the glyphs.
                      setDraft((current) => (
                        trimMonogram(current.monogram) === monogramFor(current.name || PLACEHOLDER.name)
                          ? { ...current, monogram: "" }
                          : current
                      ));
                    }}
                    onChange={(event) => setDraft((current) => ({ ...current, monogram: trimMonogram(event.target.value) }))}
                  />
                  : <BrandIcon item={previewItem} key={fetched?.url ?? previewItem.url} />}
            </div>
            <span className="shortcut__name">{previewItem.name}</span>
          </div>
          {/* Directly under the tile so the swatches can be compared against the thing they
              change. Shown whenever the tile actually renders as a letter — including a site
              whose icon simply could not be fetched, which is exactly when someone wants to
              set the glyphs and colour by hand and where gating on the radio hid the controls. */}
          {showsLetter && (<>
            <fieldset>
              <legend>底色</legend>
              <div className="accent-grid">
                <button
                  className={`accent-swatch accent-swatch--auto ${draft.accentColor ? "" : "accent-swatch--on"}`}
                  type="button"
                  title="按网址自动选色"
                  aria-pressed={!draft.accentColor}
                  onClick={() => setDraft((current) => ({ ...current, accentColor: null }))}
                >自动</button>
                {ACCENTS.map((color) => (
                  <button
                    key={color}
                    className={`accent-swatch ${draft.accentColor === color ? "accent-swatch--on" : ""}`}
                    type="button"
                    style={{ background: color }}
                    aria-label={`使用底色 ${color}`}
                    aria-pressed={draft.accentColor === color}
                    onClick={() => setDraft((current) => ({ ...current, accentColor: color }))}
                  />
                ))}
              </div>
            </fieldset>
          </>)}
          <label>名称<input name="name" maxLength="24" required autoFocus value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          {item?.type !== "folder" && <>
          <label>网址<input name="url" inputMode="url" placeholder="example.com" required value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} /></label>
          <fieldset>
            <legend>图标方式</legend>
            <label className="radio"><input type="radio" name="iconMode" value="auto" checked={draft.iconMode === "auto"} onChange={() => setDraft((current) => ({ ...current, iconMode: "auto" }))} /><span><b>自动读取</b><small>优先使用网站图标，失败时显示字母图标</small></span></label>
            <label className="radio"><input type="radio" name="iconMode" value="generated" checked={draft.iconMode === "generated"} onChange={() => setDraft((current) => ({ ...current, iconMode: "generated" }))} /><span><b>字母图标</b><small>按名称生成字母，底色由网址决定</small></span></label>
          </fieldset>
          <div className="fetch-icon">
            <button className="ghost-button" type="button" onClick={fetchIcon} disabled={fetching || !draft.url}>
              {fetching
                ? <><CircleNotch className="spin" size={16} weight="bold" />正在获取…</>
                : <><ArrowClockwise size={16} weight="bold" />获取网站图标</>}
            </button>
            {fetchNote && <span className="fetch-icon__note">{fetchNote}</span>}
          </div>
          </>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit">{item ? "保存修改" : "添加链接"}</button>
        </form>
      </section>
    </div>
  );
}
