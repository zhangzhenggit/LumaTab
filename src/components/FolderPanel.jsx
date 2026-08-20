import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BrandIcon } from "./BrandIcon";
import { iconProps } from "./ShortcutTile";

const MAX_FOLDER_COLUMNS = 5;
const VIEWPORT_MARGIN = 16;
const TILE_GAP = 10;

// Drops the panel directly beneath the tile it was opened from, horizontally centred on it, and
// keeps it on screen. Centring it over the tile hid the very folder being opened; sitting below
// keeps that anchor visible so the panel reads as belonging to it.
function placement(tile, size) {
  if (!tile || !size.width) return null;
  const left = Math.min(
    Math.max(VIEWPORT_MARGIN, tile.left + tile.width / 2 - size.width / 2),
    Math.max(VIEWPORT_MARGIN, window.innerWidth - size.width - VIEWPORT_MARGIN),
  );
  const below = tile.bottom + TILE_GAP;
  // Flip above the tile when there is not enough room underneath, rather than letting the panel
  // run off the bottom of the window.
  const fitsBelow = below + size.height <= window.innerHeight - VIEWPORT_MARGIN;
  const top = fitsBelow
    ? below
    : Math.max(VIEWPORT_MARGIN, tile.top - TILE_GAP - size.height);
  return {
    left,
    top,
    // transform-origin is resolved against the element's own box, so the tile's viewport
    // coordinates have to be rebased onto it. Feeding raw viewport values made the panel scale
    // out from a point far outside itself, which looked like it flew in from the right.
    originX: tile.left + tile.width / 2 - left,
    originY: fitsBelow ? 0 : size.height,
  };
}

export function FolderPanel({ folder, tile, onClose, onItemContextMenu }) {
  const stageRef = useRef(null);
  const [position, setPosition] = useState(null);

  // WeTab's folder has no close button — clicking away dismisses it. Escape keeps that gesture
  // reachable without putting a control back on the card.
  useEffect(() => {
    if (!folder) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [folder, onClose]);

  // Measured after layout but before paint, so the panel never appears at one position and then
  // jumps to another.
  useLayoutEffect(() => {
    if (!folder || !stageRef.current) {
      setPosition(null);
      return;
    }
    const { width, height } = stageRef.current.getBoundingClientRect();
    setPosition(placement(tile, { width, height }));
  }, [folder, tile]);

  if (!folder) return null;
  const columns = Math.max(1, Math.min(folder.children.length, MAX_FOLDER_COLUMNS));

  return (
    <div className="folder-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={stageRef}
        className={`folder-stage ${position ? "folder-stage--anchored" : ""}`}
        style={{
          "--folder-columns": columns,
          ...(position ? {
            left: `${position.left}px`,
            top: `${position.top}px`,
            "--origin-x": `${position.originX}px`,
            "--origin-y": `${position.originY}px`,
          } : null),
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* The tile sits directly above the panel with its name already under it, so a floating
            title here only repeats that text on top of it. Kept for assistive tech. */}
        <h2 id="folder-title" className="sr-only">{folder.name}</h2>
        <section className="folder-panel" role="dialog" aria-modal="true" aria-labelledby="folder-title">
          <div className="folder-panel__grid">
            {folder.children.map((child) => (
              <a className="folder-panel__item" href={child.url} key={child.id} onContextMenu={(event) => onItemContextMenu(event, child, folder.id)}>
                <span {...iconProps(child)}><BrandIcon item={child} /></span>
                <span className="shortcut__label"><span className="shortcut__name">{child.name}</span></span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
