import { useEffect, useRef, useState } from "react";
import { CaretDown, DotsSixVertical, DotsThree } from "@phosphor-icons/react";
import { useDraggable } from "@dnd-kit/core";
import { isCollapsed, isNamed } from "../lib/sections";

const MAX_NAME = 24;

// The heading carries every action a section has, and carries them where they can be seen. The
// first version put rename on a click and delete on a right-click only, which is the shape most
// people never find: right-click is the power-user path everywhere it appears, never the only
// one. Notion, Steam and Figma all hang a visible menu button off the group title on hover, and
// Windows 10's Start groups put a drag grip in the same place — so both live here, revealed on
// hover and on keyboard focus.
export function SectionHeading({
  section, blockIndex, count, editing, seamArmed, dropArmed,
  onStartEdit, onCommit, onCancel, onContextMenu, onToggleCollapse,
}) {
  const inputRef = useRef(null);
  // Escape unmounts the input, and removing a focused field fires blur — which would then commit
  // the very draft the user just abandoned. The flag is read once and cleared.
  const cancelled = useRef(false);
  const [draft, setDraft] = useState(section.name);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: section.id });

  const named = isNamed(section);
  const collapsed = isCollapsed(section);
  // A heading with no name and nothing hidden behind it is laid out at zero height; collapsed it
  // has to stay visible, or a section with neither a name nor visible tiles would be a piece of
  // the grid nobody could find again. And never while it is being named: the field lives inside
  // the pill, which a compact heading does not render, so "命名此分组" set `editing` and then put
  // nothing on screen — the one path back from a cleared name was a dead end.
  const compact = !named && !collapsed && !editing;

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
    // Selected, not caret-at-end: a heading is born named "新分组" and every one of those is
    // meant to be typed straight over.
    input.select();
  }, [editing]);

  const controls = (
    <>
      {/* Collapse leads the group. It used to hang off the LEFT of the label with a negative
          margin, which made a hovered heading read as "⌄ [pill] ··· ⠿" — three marks on two
          sides of an object, and the one on the left looked like it belonged to the row above.
          Every action a heading has now hangs off the same side, in the order it is used:
          collapse, then more, then move. */}
      {!compact && (
        <button
          type="button"
          className="section-heading__caret"
          aria-label={collapsed ? "展开分组" : "折叠分组"}
          aria-expanded={!collapsed}
          onClick={onToggleCollapse}
        ><CaretDown size={13} weight="bold" /></button>
      )}
      <button
        type="button"
        className="section-heading__menu"
        aria-label="分组操作"
        onClick={onContextMenu}
        onContextMenu={onContextMenu}
      ><DotsThree size={18} weight="bold" /></button>
      <button
        ref={setNodeRef}
        type="button"
        className="section-heading__grip"
        aria-label="拖动以移动分组"
        {...attributes}
        {...listeners}
      ><DotsSixVertical size={16} weight="bold" /></button>
    </>
  );

  return (
    <div
      className={[
        "section-heading",
        compact ? "section-heading--compact" : "",
        collapsed ? "section-heading--collapsed" : "",
        isDragging ? "section-heading--dragging" : "",
        dropArmed ? "section-heading--armed" : "",
      ].filter(Boolean).join(" ")}
      style={{ "--wave": blockIndex }}
      data-seam={blockIndex}
      // Only when collapsed. The block has no tiles on screen then, so the heading itself has to
      // be the thing a drag can aim at; while it is expanded its own tiles are the targets, and a
      // second target on the same marker would just be a magnet sitting in the row gap.
      {...(collapsed ? { "data-tile-id": section.id } : null)}
    >
      <span className="section-seam" aria-hidden="true" data-armed={seamArmed ? "" : undefined} />
      {collapsed && <span className="shortcut__icon section-heading__target" aria-hidden="true" />}
      {!compact && (
      // The pill is an inner element, never the row. The row has to keep spanning the whole grid
      // because `.section-seam` — the landing indicator for a dragged section — is absolutely
      // positioned across it, and a row that shrank to hug its label would shrink the seam with
      // it. It is also what keeps `.section-heading__target` on the icon rail.
      <span className="section-heading__pill">
      {editing ? (
        <input
          ref={inputRef}
          className="section-heading__input"
          value={draft}
          maxLength={MAX_NAME}
          aria-label="分组名称"
          placeholder="分组名称（可留空）"
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
        <>
          <button
            type="button"
            className="section-heading__name"
            title="点击重命名"
            onClick={onStartEdit}
            onContextMenu={onContextMenu}
          >{named ? section.name : "未命名"}</button>
          {collapsed && <span className="section-heading__count">{count}</span>}
        </>
      )}
      </span>
      )}
      {!compact && controls}
      {compact && (
        // A heading with its name cleared keeps the break and gives back the line. The row is
        // laid out at zero height, so the two row-gaps either side of it simply meet; what sits
        // in the gap is an overlay that occupies nothing and shows nothing until pointed at,
        // which is also the only way back to naming it. No pill here: an empty name is a divider,
        // and a divider with a glass chip floating on it is a caption again.
        <span className="section-heading__float">
          <button type="button" className="section-heading__add" onClick={onStartEdit}>命名此分组</button>
          {controls}
        </span>
      )}
    </div>
  );
}

// An empty section still has to be somewhere a link can be dropped, and the grid only aims at
// things that were measured — so the placeholder carries the marker's own id. planDrop then
// resolves it like any other cell and lands the link immediately after the marker, which is
// exactly "inside this section". No new drop kind, no new branch in applyPlan.
//
// It draws nothing at rest. The first version drew a visible outlined square, which sat next to
// the "+" tile looking almost exactly like it while meaning something entirely different; Notion
// and Steam both leave an empty group as a heading over blank space, and the ring only has to
// exist at the moment it is being aimed at.
export function SectionDropCell({ section, wave, armed }) {
  return (
    <div
      className={`shortcut section-drop ${armed ? "section-drop--armed" : ""}`}
      style={{ "--wave": wave }}
      data-tile-id={section.id}
      aria-hidden="true"
    >
      <span className="shortcut__icon section-drop__icon" />
    </div>
  );
}
