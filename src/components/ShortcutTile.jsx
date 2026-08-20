import { Plus } from "@phosphor-icons/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

export function ShortcutTile({ item, onActivate, onContextMenu, dropMode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  function keyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate(item, event);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`shortcut ${isDragging ? "shortcut--dragging" : ""} ${dropMode ? "shortcut--merge-ready" : ""}`}
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
export function AddTile({ onClick }) {
  return (
    <button className="shortcut" type="button" aria-label="添加快捷方式" onClick={onClick}>
      <span className="shortcut__icon shortcut__icon--add"><Plus size={24} weight="regular" aria-hidden="true" /></span>
    </button>
  );
}
