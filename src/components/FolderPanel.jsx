import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { BrandIcon } from "./BrandIcon";
import { iconProps } from "./ShortcutTile";

const MAX_FOLDER_COLUMNS = 5;
const VIEWPORT_MARGIN = 16;
const TILE_GAP = 10;
const EXIT_ID = "folder-exit";

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
  const fitsBelow = below + size.height <= window.innerHeight - VIEWPORT_MARGIN;
  const top = fitsBelow ? below : Math.max(VIEWPORT_MARGIN, tile.top - TILE_GAP - size.height);
  return {
    left,
    top,
    // transform-origin resolves against the element's own box, so the tile's viewport coordinates
    // have to be rebased onto it or the panel appears to fly in from the side.
    originX: tile.left + tile.width / 2 - left,
    originY: fitsBelow ? 0 : size.height,
  };
}

function FolderItem({ item, folderId, onContextMenu, onOpen }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      className={`folder-panel__item ${isDragging ? "folder-panel__item--dragging" : ""}`}
      role="link"
      tabIndex="0"
      aria-label={`打开 ${item.name}`}
      onClick={() => onOpen(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(item); }
      }}
      onContextMenu={(event) => onContextMenu(event, item, folderId)}
      {...attributes}
      {...listeners}
    >
      <span {...iconProps(item)}><BrandIcon item={item} /></span>
      <span className="shortcut__label"><span className="shortcut__name">{item.name}</span></span>
    </div>
  );
}

export function FolderPanel({ folder, tile, onClose, onItemContextMenu, onExtract, onOpenItem }) {
  const stageRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [dragging, setDragging] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  // The card itself is the "keep it here" zone; everywhere else means take it out. Registering the
  // card rather than the backdrop keeps the test simple: inside the card is inside the folder.
  const { setNodeRef: setKeepRef } = useDroppable({ id: EXIT_ID });

  useEffect(() => {
    if (!folder) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [folder, onClose]);

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
  const draggingItem = folder.children.find((child) => child.id === dragging) ?? null;

  // Released outside the card, the link leaves the folder. Without this there was simply no way
  // back out short of the context menu — a link could be dragged in and then was stuck.
  function dragEnd(event) {
    setDragging(null);
    if (event.over?.id === EXIT_ID) return;
    const item = folder.children.find((child) => child.id === String(event.active.id));
    if (item) onExtract(folder.id, item);
  }

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
        <h2 id="folder-title" className="sr-only">{folder.name}</h2>
        <DndContext
          sensors={sensors}
          onDragStart={(event) => setDragging(String(event.active.id))}
          onDragEnd={dragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <section
            ref={setKeepRef}
            className={`folder-panel ${dragging ? "folder-panel--dragging" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="folder-title"
          >
            <div className="folder-panel__grid">
              {folder.children.map((child) => (
                <FolderItem
                  key={child.id}
                  item={child}
                  folderId={folder.id}
                  onContextMenu={onItemContextMenu}
                  onOpen={onOpenItem}
                />
              ))}
            </div>
          </section>
          <DragOverlay dropAnimation={null}>
            {draggingItem ? (
              <div className="folder-panel__item folder-panel__item--overlay">
                <span {...iconProps(draggingItem)}><BrandIcon item={draggingItem} /></span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        {dragging && <p className="folder-stage__hint">拖出面板即可移出分组</p>}
      </div>
    </div>
  );
}
