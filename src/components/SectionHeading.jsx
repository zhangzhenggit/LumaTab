import { useEffect, useRef, useState } from "react";

const MAX_NAME = 24;

// The title is edited where it sits. One line, no validation, nothing to tab to — a field this
// small does not earn a dialog, and editing in place leaves the links it names on screen while
// the name is being chosen.
export function SectionHeading({ section, index, editing, onStartEdit, onCommit, onCancel, onContextMenu }) {
  const inputRef = useRef(null);
  // Escape unmounts the input, and removing a focused field fires blur — which would then commit
  // the very draft the user just abandoned. The flag is read once and cleared.
  const cancelled = useRef(false);
  const [draft, setDraft] = useState(section.name);

  useEffect(() => {
    if (!editing) return;
    setDraft(section.name);
    cancelled.current = false;
  }, [editing, section.name]);

  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // Selected, not caret-at-end: a heading is born named "新分区" and every one of those is
    // meant to be typed straight over.
    input.select();
  }, [editing]);

  return (
    <div className="section-heading" style={{ "--i": index }}>
      {editing ? (
        <input
          ref={inputRef}
          className="section-heading__input"
          value={draft}
          maxLength={MAX_NAME}
          aria-label="分区名称"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (cancelled.current) { cancelled.current = false; return; }
            onCommit(draft);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); onCommit(draft); }
            if (event.key === "Escape") { event.preventDefault(); cancelled.current = true; onCancel(); }
          }}
        />
      ) : (
        <button
          type="button"
          className="section-heading__name"
          title="点击重命名"
          onClick={onStartEdit}
          onContextMenu={onContextMenu}
        >{section.name}</button>
      )}
    </div>
  );
}

// An empty section still has to be somewhere a link can be dropped, and the grid only aims at
// things that were measured — so the placeholder carries the marker's own id. planDrop then
// resolves it like any other cell and lands the link immediately after the marker, which is
// exactly "inside this section". No new drop kind, no new branch in applyPlan.
export function SectionDropCell({ section, index, armed }) {
  return (
    <div
      className={`shortcut section-drop ${armed ? "section-drop--armed" : ""}`}
      style={{ "--i": index }}
      data-tile-id={section.id}
      aria-hidden="true"
    >
      <span className="shortcut__icon section-drop__icon" />
      <span className="section-drop__hint">拖到这里</span>
    </div>
  );
}
