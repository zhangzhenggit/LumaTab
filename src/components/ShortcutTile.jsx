import { Plus } from "@phosphor-icons/react";
import { useDraggable } from "@dnd-kit/core";
import { BrandIcon, iconAppearance, PREVIEW_CSS_PX } from "./BrandIcon";

export function iconProps(item) {
  const { kind, accent } = iconAppearance(item);
  return {
    className: `shortcut__icon shortcut__icon--${kind}`,
    style: accent ? { "--tile-accent": accent } : undefined,
  };
}

function FolderPreview({ folder }) {
  return (
    <span className="folder-preview" aria-hidden="true">
      {folder.children.slice(0, 4).map((child) => {
        const { kind, accent } = iconAppearance(child, PREVIEW_CSS_PX);
        return (
          <span
            className={`folder-preview__cell folder-preview__cell--${kind}`}
            style={accent ? { "--tile-accent": accent } : undefined}
            key={child.id}
          ><BrandIcon item={child} compact /></span>
        );
      })}
    </span>
  );
}

function TileFace({ item, dropMode }) {
  return (
    <div {...iconProps(item)}>
      {item.type === "folder" ? <FolderPreview folder={item} /> : <BrandIcon item={item} />}
      {dropMode && <span className="shortcut__drop-label" aria-hidden="true" />}
    </div>
  );
}

function TileLabel({ name }) {
  return <div className="shortcut__label"><span className="shortcut__name">{name}</span></div>;
}

// A plain draggable, not a sortable. useSortable exists to animate a live preview of the new
// order, and that preview was the whole problem: it moved the tile the pointer was aiming at.
// The tile therefore carries no transform at all — it sits still for the entire drag, and the
// only feedback is the ring on a merge target or the caret in the gap it would slot into.
export function ShortcutTile({ item, index = 0, muted, onActivate, onContextMenu, dropMode, dropEdge, landed }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });

  function keyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate(item, event);
    }
  }

  return (
    <div
      ref={setNodeRef}
      // `muted` is a tile inside the section whose heading is being dragged: the block moves
      // as one, so the whole block has to read as picked up, not just the line above it.
      className={`shortcut ${isDragging || muted ? "shortcut--dragging" : ""} ${dropMode ? "shortcut--merge-ready" : ""} ${landed ? "shortcut--landed" : ""}`}
      // Its place in the entrance queue; see .shortcut-grid--ready .shortcut in styles.css. The
      // grid's column count comes from auto-fill, so this is the only ordering either side knows.
      style={{ "--i": index }}
      data-tile-id={item.id}
      role="link"
      tabIndex="0"
      aria-label={item.type === "folder" ? `打开分组 ${item.name}` : `打开 ${item.name}`}
      onClick={(event) => onActivate(item, event)}
      onContextMenu={(event) => onContextMenu(event, item)}
      onKeyDown={keyDown}
      {...attributes}
      {...listeners}
    >
      <TileFace item={item} dropMode={dropMode} />
      <TileLabel name={item.name} />
      {dropEdge && <span className={`shortcut__caret shortcut__caret--${dropEdge}`} aria-hidden="true" />}
    </div>
  );
}

export function ShortcutGhost({ item }) {
  return (
    <div className="shortcut shortcut--overlay">
      <TileFace item={item} />
      <TileLabel name={item.name} />
    </div>
  );
}

// No label: an unnamed "+" is what closes the row in WeTab, and a caption under it would read
// as one more site rather than as the affordance to add one.
export function AddTile({ index = 0, onClick }) {
  return (
    <button className="shortcut" type="button" style={{ "--i": index }} aria-label="添加快捷方式" onClick={onClick}>
      <span className="shortcut__icon shortcut__icon--add"><Plus size={24} weight="regular" aria-hidden="true" /></span>
    </button>
  );
}
