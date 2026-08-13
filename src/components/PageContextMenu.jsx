import { ArrowsClockwise, ImageSquare } from "@phosphor-icons/react";

export function PageContextMenu({ menu, onClose, onCycleBackground, onRefreshIcons }) {
  if (!menu) return null;
  const left = Math.min(menu.x, window.innerWidth - 230);
  const top = Math.min(menu.y, window.innerHeight - 116);
  return (
    <div className="context-layer" role="presentation" onMouseDown={onClose} onContextMenu={(event) => event.preventDefault()}>
      <div className="context-menu context-menu--page" role="menu" style={{ left, top }} onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" role="menuitem" onClick={onCycleBackground}><ImageSquare size={18} /><span>换一张 Bing 背景</span></button>
        <button type="button" role="menuitem" onClick={onRefreshIcons}><ArrowsClockwise size={18} /><span>查找高清网站图标</span></button>
      </div>
    </div>
  );
}
