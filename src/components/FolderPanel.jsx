import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useSensor, useSensors } from "@dnd-kit/core";
import { BrandIcon } from "./BrandIcon";
import { applyPlan, DROP_REORDER, isInside, planDrop, pointerAt, samePlan } from "../lib/drag-plan";
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

function FolderItem({ item, folderId, dropEdge, onContextMenu, onOpen }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      data-tile-id={item.id}
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
      {dropEdge && <span className={`shortcut__caret shortcut__caret--${dropEdge}`} aria-hidden="true" />}
    </div>
  );
}

export function FolderPanel({ folder, tile, onClose, onItemContextMenu, onExtract, onOpenItem, onReorder }) {
  const stageRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dropPlan, setDropPlan] = useState(null);
  // The panel's own drag-start snapshot. Same contract as the grid's, for the same reason: the
  // cells must not move while they are being aimed at. See drag-plan.js.
  const cellsRef = useRef([]);
  // The card's own rect, taken with the cells. "Inside the card" is decided from this and the
  // pointer, not from dnd-kit's `over`: the default collision detection tests the *dragged
  // element's* rect rather than the cursor, so a tile whose box had drifted past the panel edge
  // reported itself outside while the pointer was still well inside it — and every reorder came
  // out as "moved out of the folder" instead.
  const panelRef = useRef(null);
  const panelRectRef = useRef(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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

  function planFor(event) {
    return planDrop(pointerAt(event.activatorEvent, event.delta), cellsRef.current, {
      sourceId: String(event.active.id),
      sourceType: "link",
      // Folders do not nest and every neighbour in here is a plain link, so there is nothing to
      // merge into. Without this, hovering a neighbour's artwork would arm a ring for an outcome
      // that cannot happen.
      merge: false,
    });
  }

  function dragStart(event) {
    panelRectRef.current = panelRef.current?.getBoundingClientRect() ?? null;
    cellsRef.current = Array.from(stageRef.current?.querySelectorAll("[data-tile-id]") ?? [])
      .map((node) => ({
        id: node.dataset.tileId,
        type: "link",
        cell: node.getBoundingClientRect(),
        icon: node.querySelector(".shortcut__icon")?.getBoundingClientRect() ?? null,
      }));
    setDragging(String(event.active.id));
    setDropPlan(planFor(event));
  }

  // Released outside the card, the link leaves the folder. Without this there was simply no way
  // back out short of the context menu — a link could be dragged in and then was stuck. Released
  // inside it, the same geometry the main grid uses decides where it lands, so a folder reorders
  // the way everything else on this page does rather than being the one place a drag does nothing.
  function dragEnd(event) {
    const plan = planFor(event);
    const point = pointerAt(event.activatorEvent, event.delta);
    setDragging(null);
    setDropPlan(null);
    const sourceId = String(event.active.id);
    if (!isInside(point, panelRectRef.current)) {
      const item = folder.children.find((child) => child.id === sourceId);
      if (item) onExtract(folder.id, item);
      return;
    }
    const next = applyPlan(folder.children, plan, { sourceId });
    if (next !== folder.children) onReorder(folder.id, next);
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
          onDragStart={dragStart}
          onDragMove={(event) => {
            const next = planFor(event);
            setDropPlan((current) => (samePlan(current, next) ? current : next));
          }}
          onDragEnd={dragEnd}
          onDragCancel={() => { setDragging(null); setDropPlan(null); }}
        >
          <section
            ref={panelRef}
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
                  dropEdge={dropPlan?.kind === DROP_REORDER && dropPlan.targetId === child.id ? dropPlan.side : null}
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
        {dragging && <p className="folder-stage__hint">拖动排序，拖出面板即可移出分组</p>}
      </div>
    </div>
  );
}
