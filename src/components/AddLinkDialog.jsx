import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react";

export function AddLinkDialog({ open, item = null, onClose, onSubmit }) {
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) setError("");
  }, [open]);

  if (!open) return null;

  function submit(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const values = { name: String(form.get("name") ?? "").trim() };
      if (item?.type !== "folder") {
        values.url = String(form.get("url") ?? "").trim();
        values.iconMode = String(form.get("iconMode") ?? "auto");
      }
      onSubmit(values);
      event.currentTarget.reset();
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="add-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="dialog__header">
          <div><p className="dialog__eyebrow">{item ? "编辑" : "新快捷链接"}</p><h2 id="add-title">{item?.type === "folder" ? "重命名分组" : item ? "修改快捷链接" : "添加到浮光新页"}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={20} /></button>
        </header>
        <form className="dialog__form" onSubmit={submit} key={item?.id ?? "new-link"}>
          <label>名称<input name="name" maxLength="24" required autoFocus defaultValue={item?.name ?? ""} /></label>
          {item?.type !== "folder" && <>
          <label>网址<input name="url" inputMode="url" placeholder="example.com" required defaultValue={item?.url ?? ""} /></label>
          <fieldset>
            <legend>图标方式</legend>
            <label className="radio"><input type="radio" name="iconMode" value="auto" defaultChecked={!item || item.iconMode !== "generated"} /><span><b>自动读取</b><small>优先使用网站图标，失败时显示本地符号</small></span></label>
            <label className="radio"><input type="radio" name="iconMode" value="generated" defaultChecked={item?.iconMode === "generated"} /><span><b>自动生成</b><small>按名称和网址选择稳定的语义符号</small></span></label>
          </fieldset>
          </>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit">{item ? "保存修改" : "添加链接"}</button>
        </form>
      </section>
    </div>
  );
}
