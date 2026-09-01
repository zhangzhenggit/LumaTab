import { ArrowUp, ArrowsInLineVertical, ArrowsOutLineVertical, FolderOpen, PencilSimple, Smiley, Trash } from "@phosphor-icons/react";

export function ItemContextMenu({ menu, item, onClose, onEdit, onPickIcon, onToggleCollapse, onMoveOut, onDissolve, onDelete }) {
  if (!menu || !item) return null;

  const isSection = item.type === "section";
  const collapsed = isSection && item.collapsed === true;

  const left = Math.min(menu.x, window.innerWidth - 196);
  const top = Math.min(menu.y, window.innerHeight - 210);

  return (
    <div className="context-layer" role="presentation" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div className="context-menu" role="menu" style={{ left, top }} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" role="menuitem" onClick={onEdit}>
          <PencilSimple size={18} /><span>{isSection ? (item.name ? "重命名分区" : "命名分区") : item.type === "folder" ? "重命名分组" : "编辑快捷链接"}</span>
        </button>
        {isSection && (
          <button type="button" role="menuitem" onClick={onPickIcon}>
            <Smiley size={18} /><span>选择图标</span>
          </button>
        )}
        {isSection && (
          <button type="button" role="menuitem" onClick={onToggleCollapse}>
            {collapsed ? <ArrowsOutLineVertical size={18} /> : <ArrowsInLineVertical size={18} />}
            <span>{collapsed ? "展开分区" : "折叠分区"}</span>
          </button>
        )}
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
        {/* Deliberately not in the danger colour. Deleting a heading deletes the heading — every
            link under it joins the section above — so red would be claiming a cost that is not
            there, and the red in this menu has to keep meaning "this loses something". */}
        {isSection && (
          <button type="button" role="menuitem" onClick={onDelete}>
            <Trash size={18} /><span>删除分区</span>
          </button>
        )}
      </div>
    </div>
  );
}
