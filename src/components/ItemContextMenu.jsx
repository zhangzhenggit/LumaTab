import { ArrowUp, FolderOpen, PencilSimple, Trash } from "@phosphor-icons/react";

export function ItemContextMenu({ menu, item, onClose, onEdit, onMoveOut, onDissolve, onDelete }) {
  if (!menu || !item) return null;

  const left = Math.min(menu.x, window.innerWidth - 196);
  const top = Math.min(menu.y, window.innerHeight - 210);

  return (
    <div className="context-layer" role="presentation" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div className="context-menu" role="menu" style={{ left, top }} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" role="menuitem" onClick={onEdit}>
          <PencilSimple size={18} /><span>{item.type === "folder" ? "重命名分组" : "编辑快捷链接"}</span>
        </button>
        {menu.folderId && (
          <button type="button" role="menuitem" onClick={onMoveOut}>
            <ArrowUp size={18} /><span>移出分组</span>
          </button>
        )}
        {item.type === "folder" && (
          <button type="button" role="menuitem" onClick={onDissolve}>
            <FolderOpen size={18} /><span>解散分组</span>
          </button>
        )}
        {item.type === "link" && (
          <button className="context-menu__danger" type="button" role="menuitem" onClick={onDelete}>
            <Trash size={18} /><span>删除</span>
          </button>
        )}
      </div>
    </div>
  );
}
