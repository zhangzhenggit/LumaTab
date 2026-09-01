import { useEffect } from "react";
import { Prohibit } from "@phosphor-icons/react";
import { SECTION_ACCENTS, SECTION_ICON_GROUPS } from "../lib/section-icons";
import { SectionIcon } from "./SectionIcon";

// Measured, not guessed: eight 34px columns with 2px gaps inside 8px of padding, six shelves
// each carrying a label. They exist only to keep the panel on screen near an edge, so a couple
// of pixels out costs nothing — fifty out means it opens half off the bottom.
const PANEL_W = 302;
const PANEL_H = 476;

export function SectionIconPicker({ picker, current, accent, onPick, onPickAccent, onClose }) {
  // It no longer closes when something is picked, so it needs the other way out that every
  // dismissible surface here has. Registered before the early return, because hooks must be.
  useEffect(() => {
    if (!picker) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [picker, onClose]);

  if (!picker) return null;
  const left = Math.min(picker.x, window.innerWidth - PANEL_W - 12);
  const top = Math.min(picker.y, window.innerHeight - PANEL_H - 12);

  return (
    <div className="context-layer" role="presentation" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div
        className="icon-picker"
        role="dialog"
        aria-label="分区图标"
        style={{ left, top }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* Out of the grid and into the header. It shared a row with the glyphs while there were
            two dozen of them; with six labelled shelves it would have to belong to one of them,
            and it belongs to none. */}
        <div className="icon-picker__head">
          <span className="icon-picker__title">分区图标</span>
          <button
            type="button"
            className={`icon-picker__clear ${current ? "" : "icon-picker__clear--on"}`}
            onClick={() => onPick(null)}
          ><Prohibit size={13} weight="bold" />不使用</button>
        </div>
        {SECTION_ICON_GROUPS.map((group) => (
          <div className="icon-picker__group" key={group.label}>
            <span className="icon-picker__label">{group.label}</span>
            <div className="icon-picker__grid">
              {group.icons.map(([name, label]) => (
                <button
                  key={name}
                  type="button"
                  className={`icon-picker__cell ${current === name ? "icon-picker__cell--on" : ""}`}
                  // Both, and deliberately: `title` is the hover tooltip, `aria-label` is what a
                  // screen reader reads. Forty-eight silhouettes with no words is a search.
                  title={label}
                  aria-label={label}
                  onClick={() => onPick(name)}
                ><SectionIcon name={name} /></button>
              ))}
            </div>
          </div>
        ))}
        {/* Only once there is a glyph: a colour with nothing to put it behind changes nothing on
            screen, and a control that visibly does nothing is worse than one that is not there. */}
        {current && (
          <div className="icon-picker__group">
            <span className="icon-picker__label">颜色</span>
            <div className="accent-grid accent-grid--picker">
              {/* White is not a twelfth colour, it is the absence of the chip — and it happens to
                  show exactly what you get, which is a white glyph on the photograph. */}
              <button
                type="button"
                className={`accent-swatch accent-swatch--auto ${accent ? "" : "accent-swatch--on"}`}
                aria-label="不使用颜色"
                aria-pressed={!accent}
                onClick={() => onPickAccent(null)}
              />
              {SECTION_ACCENTS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`accent-swatch ${accent === color ? "accent-swatch--on" : ""}`}
                  style={{ background: color }}
                  aria-label={color}
                  aria-pressed={accent === color}
                  onClick={() => onPickAccent(color)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
