import { Globe, X } from "@phosphor-icons/react";

// Sits under the grid rather than over it: the icons it is talking about are right above, and a
// modal for a permission the user has not asked about would be worse than the Settings switch
// it replaces. One click grants; one click retires it for good.
export function SiteAccessPrompt({ onGrant, onDismiss }) {
  return (
    <div className="site-access" role="status">
      <Globe size={18} weight="regular" aria-hidden="true" />
      <p className="site-access__text">
        当前使用 Chrome 已有的低清图标，允许读取网站即可抓取高清版本。
      </p>
      <button className="site-access__grant" type="button" onClick={onGrant}>允许</button>
      <button className="site-access__close" type="button" aria-label="不再提示" onClick={onDismiss}>
        <X size={14} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
