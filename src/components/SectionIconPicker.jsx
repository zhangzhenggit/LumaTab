import { Prohibit } from "@phosphor-icons/react";
import { SECTION_ICONS } from "../lib/section-icons";
import { SectionIcon } from "./SectionIcon";

// Measured, not guessed: 8 columns of 34px plus 2px gaps and 8px of padding, over three rows.
// They only exist to keep the panel on screen near the edges, so being a couple of pixels out
// costs nothing — being 50 out means it opens half off the bottom.
const PANEL_W = 302;
const PANEL_H = 122;

export function SectionIconPicker({ picker, current, onPick, onClose }) {
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
        <div className="icon-picker__grid">
          {SECTION_ICONS.map((name) => (
            <button
              key={name}
              type="button"
              className={`icon-picker__cell ${current === name ? "icon-picker__cell--on" : ""}`}
              aria-label={name}
              onClick={() => onPick(name)}
            ><SectionIcon name={name} /></button>
          ))}
          {/* Last, not first: it shares the grid with the glyphs, so putting it in front would
              push every category out of the row it was grouped into. */}
          <button
            type="button"
            className={`icon-picker__cell ${current ? "" : "icon-picker__cell--on"}`}
            aria-label="不使用图标"
            onClick={() => onPick(null)}
          ><Prohibit size={17} /></button>
        </div>
      </div>
    </div>
  );
}
