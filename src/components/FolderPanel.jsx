import { X } from "@phosphor-icons/react";
import { BrandIcon, iconAppearance } from "./BrandIcon";

const MAX_FOLDER_COLUMNS = 5;

export function FolderPanel({ folder, onClose, onItemContextMenu }) {
  if (!folder) return null;
  const columns = Math.max(1, Math.min(folder.children.length, MAX_FOLDER_COLUMNS));
  return (
    <div className="folder-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="folder-stage" style={{ "--folder-columns": columns }} onMouseDown={(event) => event.stopPropagation()}>
        <header className="folder-stage__header">
          <h2 id="folder-title">{folder.name}</h2>
          <button type="button" aria-label="关闭" onClick={onClose}><X size={22} /></button>
        </header>
        <section className="folder-panel" role="dialog" aria-modal="true" aria-labelledby="folder-title">
          <div className="folder-panel__grid">
            {folder.children.map((child) => (
              <a className="folder-panel__item" href={child.url} key={child.id} onContextMenu={(event) => onItemContextMenu(event, child, folder.id)}>
                <span
                  className={`folder-panel__icon folder-panel__icon--${iconAppearance(child).kind}`}
                  style={iconAppearance(child).surface ? { "--tile-accent": iconAppearance(child).surface } : undefined}
                ><BrandIcon item={child} /></span>
                <span>{child.name}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
