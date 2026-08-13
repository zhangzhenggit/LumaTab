import { Plus } from "@phosphor-icons/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BrandIcon, iconAppearance } from "./BrandIcon";

function surfaceProps(item) {
  const appearance = iconAppearance(item);
  return {
    className: `shortcut__surface ${item.type === "folder" ? "shortcut__surface--folder" : ""} shortcut__surface--${appearance.kind}`,
    style: appearance.surface ? { "--tile-accent": appearance.surface } : undefined,
  };
}

function TileContent({ item }) {
  if (item.type !== "folder") return <BrandIcon item={item} />;
  return (
    <span className="folder-preview" aria-hidden="true">
      {item.children.slice(0, 4).map((child) => (
        <span
          className={`folder-preview__cell folder-preview__cell--${iconAppearance(child).kind}`}
          style={iconAppearance(child).surface ? { "--tile-accent": iconAppearance(child).surface } : undefined}
          key={child.id}
        ><BrandIcon item={child} compact /></span>
      ))}
    </span>
  );
}

export function ShortcutTile({ item, onActivate, onContextMenu, dropMode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  function keyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate(item);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`shortcut ${isDragging ? "shortcut--dragging" : ""} ${dropMode ? "shortcut--merge-ready" : ""}`}
      role="link"
      tabIndex="0"
      aria-label={item.type === "folder" ? `打开分组 ${item.name}` : `打开 ${item.name}`}
      onClick={() => onActivate(item)}
      onContextMenu={(event) => onContextMenu(event, item)}
      onKeyDown={keyDown}
      {...attributes}
      {...listeners}
    >
      <div {...surfaceProps(item)}>
        <TileContent item={item} />
        {dropMode && <span className="shortcut__drop-label">{dropMode === "folder" ? "放入" : "成组"}</span>}
      </div>
      <span className="shortcut__name">{item.name}</span>
    </div>
  );
}

export function ShortcutGhost({ item }) {
  return (
    <div className="shortcut shortcut--overlay">
      <div {...surfaceProps(item)}><TileContent item={item} /></div>
      <span className="shortcut__name">{item.name}</span>
    </div>
  );
}

export function AddTile({ onClick }) {
  return (
    <button className="shortcut shortcut--button" type="button" onClick={onClick}>
      <span className="shortcut__surface shortcut__surface--add"><Plus size={30} weight="light" aria-hidden="true" /></span>
      <span className="shortcut__name">添加</span>
    </button>
  );
}
